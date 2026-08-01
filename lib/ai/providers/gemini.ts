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
  getJson,
  postJson,
  requireApiKey,
} from './http-base';

/**
 * Google Gemini adapter.
 *
 * Contract differences that justify a dedicated adapter:
 *  1. Messages are `contents` with role "model" rather than "assistant".
 *  2. The system prompt is `systemInstruction`.
 *  3. Generation parameters are nested under `generationConfig`.
 *  4. The credential is a query parameter or a header, not a bearer token.
 */

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

function mapFinishReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
      return 'content_filter';
    default:
      return 'stop';
  }
}

function partitionMessages(messages: ChatMessage[]): {
  systemInstruction: { parts: GeminiPart[] } | undefined;
  contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push(message.content);
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    systemInstruction:
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join('\n\n') }] }
        : undefined,
    contents,
  };
}

const CAPABILITY_PATTERNS: Partial<Record<Capability, RegExp>> = {
  streaming: /.*/,
  structured_output: /.*/,
  tool_use: /gemini-1\.5|gemini-2|gemini-3/i,
  vision: /gemini-1\.5|gemini-2|gemini-3|vision/i,
};

export class GeminiProvider implements ProviderAdapter {
  readonly kind = 'GEMINI' as const;
  readonly displayName = 'Google Gemini';
  readonly requiresCredential = true;

  private baseUrl(context: ProviderContext): string {
    return (context.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private headers(context: ProviderContext): Record<string, string> {
    return { 'x-goog-api-key': requireApiKey(context, 'Gemini') };
  }

  async listModels(context: ProviderContext): Promise<ProviderModelInfo[]> {
    const payload = (await getJson(
      `${this.baseUrl(context)}/models`,
      this.headers(context),
      context,
    )) as {
      models?: Array<{
        name?: string;
        displayName?: string;
        inputTokenLimit?: number;
      }>;
    };

    return (payload.models ?? [])
      .filter((model) => Boolean(model.name))
      .map((model) => {
        // Names arrive fully qualified, e.g. "models/gemini-2.0-flash".
        const modelId = (model.name as string).replace(/^models\//, '');

        return {
          modelId,
          displayName: model.displayName ?? modelId,
          contextWindow: model.inputTokenLimit ?? 32_768,
          capabilities: (
            ['streaming', 'structured_output', 'vision', 'tool_use'] as Capability[]
          ).filter((capability) =>
            capabilityFromPatterns(modelId, capability, CAPABILITY_PATTERNS),
          ),
          isDemoModel: false,
        };
      });
  }

  async healthCheck(context: ProviderContext): Promise<HealthResult> {
    const startedAt = Date.now();

    try {
      await this.listModels(context);
      return {
        healthy: true,
        latencyMs: Date.now() - startedAt,
        detail: 'Gemini model listing responded.',
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
    const { systemInstruction, contents } = partitionMessages(request.messages);

    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (request.structuredOutputSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = request.structuredOutputSchema;
    }

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    return body;
  }

  async chatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): Promise<CompletionResponse> {
    const result = await postJson({
      url: `${this.baseUrl(context)}/models/${encodeURIComponent(request.model)}:generateContent`,
      headers: this.headers(context),
      body: this.buildBody(request),
      context,
    });

    const payload = result.json as GeminiResponse;
    const candidate = payload.candidates?.[0];

    if (!candidate) {
      throw new ProviderError(
        buildNormalisedError('MALFORMED_RESPONSE', {
          message: 'The provider returned no candidates.',
        }),
      );
    }

    const content = (candidate.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('');

    const usage = normaliseUsage(
      {
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
      },
      {
        inputTokens: estimateMessagesTokens(request.messages),
        outputTokens: estimateTokens(content),
      },
    );

    return {
      requestId: context.correlationId,
      provider: this.kind,
      model: request.model,
      content,
      finishReason: mapFinishReason(candidate.finishReason),
      usage,
      estimatedCost: 0,
      latencyMs: result.latencyMs,
      providerRequestId: result.providerRequestId,
      metadata: { provider: this.kind },
    };
  }

  async *streamChatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): AsyncIterable<StreamChunk> {
    // Gemini's streaming endpoint returns a JSON array of the same candidate
    // shape. Rather than partially parse it, the adapter completes the call and
    // replays the result in word chunks, which keeps the client contract
    // identical across providers.
    const response = await this.chatCompletion(request, context);
    const words = response.content.split(/(\s+)/);

    for (const word of words) {
      yield { delta: word, done: false };
    }

    yield {
      delta: '',
      done: true,
      finishReason: response.finishReason,
      usage: response.usage,
    };
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

export const geminiProvider = new GeminiProvider();
