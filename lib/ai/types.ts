import type { ErrorCategory, ProviderKind } from '@/lib/database/generated/enums';

/**
 * The normalised envelope every provider is coerced into.
 *
 * This is the load-bearing abstraction of the platform: once a provider speaks
 * these two shapes, routing, fallback, cost accounting, tracing and analytics
 * all become provider-agnostic and need no per-provider special cases.
 */

export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Provider-native model identifier, e.g. "astra-fast". */
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** JSON Schema the response must satisfy when structured output is requested. */
  structuredOutputSchema?: Record<string, unknown>;
  /** Non-authoritative hints; never trusted for authorisation decisions. */
  metadata?: Record<string, string>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CompletionResponse {
  requestId: string;
  provider: ProviderKind;
  model: string;
  content: string;
  finishReason: FinishReason;
  usage: TokenUsage;
  /** Derived from workspace-configured pricing. An estimate, not a bill. */
  estimatedCost: number;
  latencyMs: number;
  providerRequestId: string | null;
  metadata: Record<string, unknown>;
}

export type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';

export interface StreamChunk {
  delta: string;
  done: boolean;
  finishReason?: FinishReason;
  usage?: TokenUsage;
}

export type Capability = 'streaming' | 'structured_output' | 'vision' | 'tool_use';

export interface ProviderModelInfo {
  modelId: string;
  displayName: string;
  contextWindow: number;
  capabilities: Capability[];
  isDemoModel: boolean;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  detail: string;
}

/**
 * Normalised provider failure. `category` drives retry and fallback policy;
 * `message` is safe to surface to a client and never contains credentials,
 * connection strings or stack traces.
 */
export interface NormalisedError {
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  /** Provider status code when one was returned. */
  statusCode?: number;
  /** Server-suggested wait before retrying, in milliseconds. */
  retryAfterMs?: number;
}

export class ProviderError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(normalised: NormalisedError) {
    super(normalised.message);
    this.name = 'ProviderError';
    this.category = normalised.category;
    this.retryable = normalised.retryable;
    this.statusCode = normalised.statusCode;
    this.retryAfterMs = normalised.retryAfterMs;
  }

  toNormalised(): NormalisedError {
    return {
      category: this.category,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/** Per-call context supplied by the gateway rather than by the client. */
export interface ProviderContext {
  /** Decrypted credential. Never logged, never returned to a client. */
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  correlationId: string;
  /** Fault-injection directives; honoured only by the demo provider. */
  demoBehaviour?: DemoBehaviour;
}

/** Fault injection understood exclusively by the deterministic demo provider. */
export interface DemoBehaviour {
  forceLatencyMs?: number;
  forceTimeout?: boolean;
  forceRateLimit?: boolean;
  forceUnavailable?: boolean;
  forceMalformed?: boolean;
  forceAuthFailure?: boolean;
  forceContextLimit?: boolean;
  forceSafetyRefusal?: boolean;
}

/**
 * The contract every provider adapter implements.
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly displayName: string;
  /** True when the adapter can run with no external credential. */
  readonly requiresCredential: boolean;

  listModels(context: ProviderContext): Promise<ProviderModelInfo[]>;
  healthCheck(context: ProviderContext): Promise<HealthResult>;
  chatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): Promise<CompletionResponse>;
  streamChatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): AsyncIterable<StreamChunk>;
  estimateTokens(text: string): number;
  normaliseError(error: unknown): NormalisedError;
  supportsCapability(modelId: string, capability: Capability): boolean;
}
