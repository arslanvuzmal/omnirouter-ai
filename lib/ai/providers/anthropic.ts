import { buildNormalisedError } from '../errors';
import { estimateMessagesTokens, estimateTokens, normaliseUsage } from '../tokens';
import type {
  Capability,
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  FinishReason,
  HealthResult,
  NormalisedError,
  ProviderAdapter,
  ProviderContext,
  ProviderModelInfo,
  StreamChunk,
} from '../types';
import { ProviderError } from '../types';
import {
  capabilityFromPatterns,
  defaultEstimateTokens,
  defaultNormaliseError,
  postJson,
  requireApiKey,
} from './http-base';

/**
 * Anthropic Messages API adapter.
 *
 * Two contract differences from the OpenAI shape justify a separate adapter:
 *  1. The system prompt is a top-level `system` field, not a message with
 *     role "system".
 *  2. Content is returned as an array of typed blocks rather than a string.
 *
 * Note on naming: Anthropic appears here solely as a supported AI provider.
 */

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicResponse {
  id?: string;
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function mapStopReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    case 'refusal':
      return 'content_filter';
    default:
      return 'stop';
  }
}

/** Splits the system prompt out of the message list. */
function partitionMessages(messages: ChatMessage[]): {
  system: string | undefined;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemParts: string[] = [];
  const conversation: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
    } else {
      conversation.push({ role: message.role, content: message.content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    conversation,
  };
}

const CAPABILITY_PATTERNS: Partial<Record<Capability, RegExp>> = {
  streaming: /.*/,
  structured_output: /.*/,
  tool_use: /.*/,
  vision: /claude-3|claude-4|claude-opus|claude-sonnet|claude-haiku/i,
};

export class AnthropicProvider implements ProviderAdapter {
  readonly kind = 'ANTHROPIC' as const;
  readonly displayName = 'Anthropic';
  readonly requiresCredential = true;

  private baseUrl(context: ProviderContext): string {
    return (context.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private headers(context: ProviderContext): Record<string, string> {
    return {
      'x-api-key': requireApiKey(context, 'Anthropic'),
      'anthropic-version': API_VERSION,
    };
  }

  async listModels(_context: ProviderContext): Promise<ProviderModelInfo[]> {
    // Anthropic does not expose a public listing endpoint on every plan, so the
    // workspace model catalogue is authoritative. Returning an empty list keeps
    // the contract honest rather than inventing entries.
    return [];
  }

  async healthCheck(context: ProviderContext): Promise<HealthResult> {
    const startedAt = Date.now();

    try {
      // A single-token completion is the cheapest reliable reachability probe.
      await postJson({
        url: `${this.baseUrl(context)}/messages`,
        headers: this.headers(context),
        body: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        },
        context,
      });

      return {
        healthy: true,
        latencyMs: Date.now() - startedAt,
        detail: 'Anthropic Messages API responded.',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startedAt,
        detail: this.normaliseError(error).message,
      };
    }
  }

  private buildBody(request: CompletionRequest): Record<string, unknown> {
    const { system, conversation } = partitionMessages(request.messages);

    const body: Record<string, unknown> = {
      model: request.model,
      // max_tokens is mandatory on this API; a default keeps callers portable.
      max_tokens: request.maxTokens ?? 1024,
      messages: conversation,
    };

    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;

    if (request.structuredOutputSchema) {
      // Expressed as a single-tool forced call, which is this API's mechanism
      // for constraining output to a schema.
      body.tools = [
        {
          name: 'omnirouter_structured_output',
          description: 'Return the response using this schema.',
          input_schema: request.structuredOutputSchema,
        },
      ];
      body.tool_choice = { type: 'tool', name: 'omnirouter_structured_output' };
    }

    return body;
  }

  async chatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): Promise<CompletionResponse> {
    const result = await postJson({
      url: `${this.baseUrl(context)}/messages`,
      headers: this.headers(context),
      body: this.buildBody(request),
      context,
    });

    const payload = result.json as AnthropicResponse;

    const content = (payload.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');

    if (!payload.content) {
      throw new ProviderError(
        buildNormalisedError('MALFORMED_RESPONSE', {
          message: 'The provider returned no content blocks.',
        }),
      );
    }

    const usage = normaliseUsage(
      {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      {
        inputTokens: estimateMessagesTokens(request.messages),
        outputTokens: estimateTokens(content),
      },
    );

    return {
      requestId: context.correlationId,
      provider: this.kind,
      model: payload.model ?? request.model,
      content,
      finishReason: mapStopReason(payload.stop_reason),
      usage,
      estimatedCost: 0,
      latencyMs: result.latencyMs,
      providerRequestId: payload.id ?? result.providerRequestId,
      metadata: { provider: this.kind },
    };
  }

  async *streamChatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): AsyncIterable<StreamChunk> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), context.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl(context)}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.headers(context),
        },
        body: JSON.stringify({ ...this.buildBody(request), stream: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new ProviderError(
          buildNormalisedError('PROVIDER_UNAVAILABLE', {
            statusCode: response.status,
          }),
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          try {
            const event = JSON.parse(trimmed.slice(5).trim()) as {
              type?: string;
              delta?: { text?: string };
            };

            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield { delta: event.delta.text, done: false };
            }
            if (event.type === 'message_stop') {
              yield { delta: '', done: true, finishReason: 'stop' };
              return;
            }
          } catch {
            continue;
          }
        }
      }

      yield { delta: '', done: true, finishReason: 'stop' };
    } finally {
      clearTimeout(timer);
    }
  }

  estimateTokens(text: string): number {
    return defaultEstimateTokens(text);
  }

  normaliseError(error: unknown): NormalisedError {
    return defaultNormaliseError(error);
  }

  supportsCapability(modelId: string, capability: Capability): boolean {
    return capabilityFromPatterns(modelId, capability, CAPABILITY_PATTERNS);
  }
}

export const anthropicProvider = new AnthropicProvider();
