import { buildNormalisedError } from '../errors';
import { estimateMessagesTokens, estimateTokens, normaliseUsage } from '../tokens';
import type {
  Capability,
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
  getJson,
  postJson,
  requireApiKey,
} from './http-base';
import type { ProviderKind } from '@/lib/database/generated/enums';

/**
 * Base adapter for providers exposing an OpenAI-compatible chat completions API.
 *
 * OpenAI, OpenRouter, DeepSeek and Ollama all accept the same request shape and
 * return the same response shape, so one carefully written implementation serves
 * all four. Gemini and Anthropic differ enough to warrant their own adapters.
 *
 * These adapters are written against each provider's documented contract. They
 * are exercised in tests against recorded shapes rather than live endpoints, so
 * the platform never requires a paid credential to be verifiable.
 */

interface OpenAiChoice {
  message?: { content?: string | null };
  delta?: { content?: string | null };
  finish_reason?: string | null;
}

interface OpenAiResponse {
  id?: string;
  model?: string;
  choices?: OpenAiChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
    case 'end_turn':
      return 'stop';
    case 'length':
    case 'max_tokens':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls';
    default:
      return 'stop';
  }
}

export interface OpenAiCompatibleConfig {
  kind: ProviderKind;
  displayName: string;
  defaultBaseUrl: string;
  requiresCredential: boolean;
  capabilityPatterns: Partial<Record<Capability, RegExp>>;
  /** A cheap, always-present model used for health checks. */
  healthCheckPath?: string;
}

export class OpenAiCompatibleProvider implements ProviderAdapter {
  readonly kind: ProviderKind;
  readonly displayName: string;
  readonly requiresCredential: boolean;

  protected readonly config: OpenAiCompatibleConfig;

  constructor(config: OpenAiCompatibleConfig) {
    this.config = config;
    this.kind = config.kind;
    this.displayName = config.displayName;
    this.requiresCredential = config.requiresCredential;
  }

  protected baseUrl(context: ProviderContext): string {
    return (context.baseUrl ?? this.config.defaultBaseUrl).replace(/\/+$/, '');
  }

  protected authHeaders(context: ProviderContext): Record<string, string> {
    if (!this.requiresCredential && !context.apiKey) return {};
    return { authorization: `Bearer ${requireApiKey(context, this.displayName)}` };
  }

  async listModels(context: ProviderContext): Promise<ProviderModelInfo[]> {
    const path = this.config.healthCheckPath ?? '/models';
    const payload = (await getJson(
      `${this.baseUrl(context)}${path}`,
      this.authHeaders(context),
      context,
    )) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };

    // OpenAI-style responses use `data`; Ollama uses `models`.
    const entries =
      payload.data?.map((item) => item.id).filter(Boolean) ??
      payload.models?.map((item) => item.name).filter(Boolean) ??
      [];

    return (entries as string[]).map((modelId) => ({
      modelId,
      displayName: modelId,
      // The catalogue holds the authoritative context window; this is a floor.
      contextWindow: 8_192,
      capabilities: this.inferCapabilities(modelId),
      isDemoModel: false,
    }));
  }

  protected inferCapabilities(modelId: string): Capability[] {
    const all: Capability[] = ['streaming', 'structured_output', 'vision', 'tool_use'];
    return all.filter((capability) =>
      capabilityFromPatterns(modelId, capability, this.config.capabilityPatterns),
    );
  }

  async healthCheck(context: ProviderContext): Promise<HealthResult> {
    const startedAt = Date.now();

    try {
      await this.listModels(context);
      return {
        healthy: true,
        latencyMs: Date.now() - startedAt,
        detail: `${this.displayName} responded to a model listing request.`,
      };
    } catch (error) {
      const normalised = this.normaliseError(error);
      return {
        healthy: false,
        latencyMs: Date.now() - startedAt,
        detail: normalised.message,
      };
    }
  }

  protected buildBody(request: CompletionRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    if (request.structuredOutputSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'omnirouter_structured_output',
          schema: request.structuredOutputSchema,
          strict: true,
        },
      };
    }

    return body;
  }

  async chatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): Promise<CompletionResponse> {
    const result = await postJson({
      url: `${this.baseUrl(context)}/chat/completions`,
      headers: this.authHeaders(context),
      body: this.buildBody(request),
      context,
    });

    const payload = result.json as OpenAiResponse;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? '';

    if (!choice) {
      throw new ProviderError(
        buildNormalisedError('MALFORMED_RESPONSE', {
          message: 'The provider returned no completion choices.',
        }),
      );
    }

    const usage = normaliseUsage(
      {
        inputTokens: payload.usage?.prompt_tokens,
        outputTokens: payload.usage?.completion_tokens,
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
      finishReason: mapFinishReason(choice.finish_reason),
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
      const response = await fetch(`${this.baseUrl(context)}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...this.authHeaders(context),
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
        // The final element may be a partial line; keep it for the next read.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            yield { delta: '', done: true, finishReason: 'stop' };
            return;
          }

          try {
            const parsed = JSON.parse(data) as OpenAiResponse;
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield { delta, done: false };
          } catch {
            // A single unparseable frame should not abort the stream.
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
    return capabilityFromPatterns(modelId, capability, this.config.capabilityPatterns);
  }
}
