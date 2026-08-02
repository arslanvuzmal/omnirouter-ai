import { createHash } from 'node:crypto';

import { buildNormalisedError, categoriseThrown } from '../errors';
import { estimateMessagesTokens, estimateTokens } from '../tokens';
import type {
  Capability,
  ChatMessage,
  CompletionRequest,
  CompletionResponse,
  DemoBehaviour,
  HealthResult,
  NormalisedError,
  ProviderAdapter,
  ProviderContext,
  ProviderModelInfo,
  StreamChunk,
} from '../types';
import { ProviderError } from '../types';

/**
 * Deterministic demo provider.
 *
 * Purpose: the entire platform — routing, fallback, tracing, analytics, quotas —
 * must be demonstrable with zero external credentials and zero network calls.
 *
 * Determinism: every output derives from a SHA-256 of the request, so the same
 * prompt against the same model always produces the same response, the same
 * token counts and the same latency. That is what makes a recorded demonstration
 * reproducible and makes the comparison screen meaningful.
 *
 * These models are fictional. They are not proxies for, and make no claim about,
 * any real commercial model.
 */

export const DEMO_MODEL_IDS = [
  'astra-fast',
  'astra-pro',
  'nimbus-reasoning',
  'local-ember',
] as const;

export type DemoModelId = (typeof DEMO_MODEL_IDS)[number];

interface DemoModelSpec {
  modelId: DemoModelId;
  displayName: string;
  contextWindow: number;
  capabilities: Capability[];
  /** Fictional pricing, USD per million tokens. */
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  /** Simulated latency envelope in milliseconds. */
  baseLatencyMs: number;
  latencyJitterMs: number;
  /** Characterises the simulated answer style. */
  verbosity: number;
}

export const DEMO_MODELS: Record<DemoModelId, DemoModelSpec> = {
  'astra-fast': {
    modelId: 'astra-fast',
    displayName: 'Astra Fast',
    contextWindow: 32_000,
    capabilities: ['streaming', 'structured_output'],
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    baseLatencyMs: 320,
    latencyJitterMs: 180,
    verbosity: 1,
  },
  'astra-pro': {
    modelId: 'astra-pro',
    displayName: 'Astra Pro',
    contextWindow: 200_000,
    capabilities: ['streaming', 'structured_output', 'vision', 'tool_use'],
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    baseLatencyMs: 900,
    latencyJitterMs: 400,
    verbosity: 2,
  },
  'nimbus-reasoning': {
    modelId: 'nimbus-reasoning',
    displayName: 'Nimbus Reasoning',
    contextWindow: 128_000,
    capabilities: ['streaming', 'structured_output', 'tool_use'],
    inputPricePerMillion: 1.1,
    outputPricePerMillion: 4.4,
    baseLatencyMs: 1_600,
    latencyJitterMs: 700,
    verbosity: 3,
  },
  'local-ember': {
    modelId: 'local-ember',
    displayName: 'Local Ember',
    contextWindow: 8_000,
    capabilities: ['streaming'],
    // Locally hosted: no external charge is modelled.
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    baseLatencyMs: 640,
    latencyJitterMs: 260,
    verbosity: 1,
  },
};

export const DEMO_MODEL_DISCLAIMER = 'Demo model — no external provider request';

function isDemoModelId(value: string): value is DemoModelId {
  return (DEMO_MODEL_IDS as readonly string[]).includes(value);
}

function specFor(modelId: string): DemoModelSpec {
  if (!isDemoModelId(modelId)) {
    throw new ProviderError(
      buildNormalisedError('INVALID_REQUEST', {
        message: `Unknown demo model "${modelId}".`,
      }),
    );
  }
  return DEMO_MODELS[modelId];
}

/** Stable 32-bit seed derived from the request; the source of all determinism. */
function seedFrom(modelId: string, messages: ChatMessage[]): number {
  const canonical = messages
    .map((message) => `${message.role}:${message.content}`)
    .join('\n');
  const digest = createHash('sha256').update(`${modelId}::${canonical}`).digest();

  return digest.readUInt32BE(0);
}

/** Deterministic PRNG (mulberry32) so a seed always yields the same sequence. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lastUserMessage(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'user') return message.content;
  }
  return messages[messages.length - 1]?.content ?? '';
}

/**
 * Composes a plausible operations-flavoured answer.
 *
 * The text is intentionally about what the platform did, so a viewer of a demo
 * sees something coherent rather than lorem ipsum — while remaining obviously
 * synthetic.
 */
function composeAnswer(
  spec: DemoModelSpec,
  prompt: string,
  random: () => number,
): string {
  const topic = prompt.trim().slice(0, 160) || 'the submitted request';

  const openings = [
    `Here is a structured response to ${quote(topic)}.`,
    `Working through ${quote(topic)} step by step.`,
    `Summary for ${quote(topic)}:`,
  ];

  const bodies = [
    'The request was normalised into the platform envelope before dispatch, so provider-specific fields never reach application code.',
    'Routing selected this target from the configured policy; the full candidate list and rejection reasons are recorded on the request trace.',
    'Token counts shown here are estimates, and the cost figure derives from the pricing configured on this model in your workspace.',
    'Every provider attempt is persisted separately, so a retry or fallback can be inspected after the fact.',
  ];

  const closings = [
    'This response was produced by a deterministic demo model and involved no external provider call.',
    'No network request left this deployment to generate this answer.',
  ];

  const parts: string[] = [pick(openings, random)];

  for (let index = 0; index < spec.verbosity; index += 1) {
    parts.push(pick(bodies, random));
  }

  parts.push(pick(closings, random));

  return parts.join('\n\n');
}

function quote(value: string): string {
  return `“${value}”`;
}

function pick<T>(values: T[], random: () => number): T {
  const index = Math.floor(random() * values.length);
  return values[Math.min(index, values.length - 1)] as T;
}

/** Builds a deterministic object satisfying a simple JSON Schema. */
function composeStructured(
  schema: Record<string, unknown>,
  prompt: string,
  random: () => number,
): string {
  const properties =
    (schema.properties as Record<string, { type?: string }> | undefined) ?? {};

  const result: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(properties)) {
    switch (definition?.type) {
      case 'number':
      case 'integer':
        result[key] = Math.round(random() * 100);
        break;
      case 'boolean':
        result[key] = random() > 0.5;
        break;
      case 'array':
        result[key] = ['alpha', 'beta', 'gamma'].slice(0, 1 + Math.floor(random() * 3));
        break;
      case 'object':
        result[key] = { note: 'demo value' };
        break;
      default:
        result[key] = `demo ${key} for ${prompt.slice(0, 32).trim()}`.trim();
    }
  }

  if (Object.keys(result).length === 0) {
    result.summary = `Demo structured output for: ${prompt.slice(0, 64).trim()}`;
  }

  return JSON.stringify(result, null, 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Applies injected faults. Ordering matters: authentication is checked first
 * because a misconfigured connection should surface before anything else.
 */
function applyFaults(behaviour: DemoBehaviour | undefined, timeoutMs: number): void {
  if (!behaviour) return;

  if (behaviour.forceAuthFailure) {
    throw new ProviderError(
      buildNormalisedError('AUTHENTICATION', {
        message: 'Demo connection rejected the configured credential.',
        statusCode: 401,
      }),
    );
  }

  if (behaviour.forceRateLimit) {
    throw new ProviderError(
      buildNormalisedError('RATE_LIMIT', {
        message: 'Demo provider is rate limiting this connection.',
        statusCode: 429,
        retryAfterMs: 400,
      }),
    );
  }

  if (behaviour.forceUnavailable) {
    throw new ProviderError(
      buildNormalisedError('PROVIDER_UNAVAILABLE', {
        message: 'Demo provider reported itself unavailable.',
        statusCode: 503,
      }),
    );
  }

  if (behaviour.forceContextLimit) {
    throw new ProviderError(
      buildNormalisedError('CONTEXT_LIMIT', {
        message: 'Demo request exceeds the context window of this model.',
        statusCode: 413,
      }),
    );
  }

  if (behaviour.forceSafetyRefusal) {
    throw new ProviderError(
      buildNormalisedError('SAFETY_REFUSAL', {
        message: 'Demo model declined to answer this request.',
      }),
    );
  }

  if (behaviour.forceMalformed) {
    throw new ProviderError(
      buildNormalisedError('MALFORMED_RESPONSE', {
        message: 'Demo provider returned a response that failed validation.',
      }),
    );
  }

  // forceTimeout is handled by the caller, which must burn real time before
  // throwing so the recorded attempt latency reflects a genuine stall.
  void timeoutMs;
}

/** Simulated stall before a timeout, capped so demos stay watchable. */
const SIMULATED_TIMEOUT_MS = 1_500;

export class DemoProvider implements ProviderAdapter {
  readonly kind = 'DEMO' as const;
  readonly displayName = 'Demo Provider';
  readonly requiresCredential = false;

  async listModels(_context: ProviderContext): Promise<ProviderModelInfo[]> {
    return Object.values(DEMO_MODELS).map((spec) => ({
      modelId: spec.modelId,
      displayName: spec.displayName,
      contextWindow: spec.contextWindow,
      capabilities: spec.capabilities,
      isDemoModel: true,
    }));
  }

  async healthCheck(context: ProviderContext): Promise<HealthResult> {
    const behaviour = context.demoBehaviour;

    if (behaviour?.forceUnavailable) {
      return {
        healthy: false,
        latencyMs: 0,
        detail: 'Demo provider is simulating an outage.',
      };
    }

    return {
      healthy: true,
      latencyMs: 12,
      detail: 'Deterministic demo provider is always reachable in-process.',
    };
  }

  async chatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): Promise<CompletionResponse> {
    const spec = specFor(request.model);
    const seed = seedFrom(request.model, request.messages);
    const random = createRandom(seed);

    // Immediate faults are raised before any simulated work is done.
    applyFaults(context.demoBehaviour, context.timeoutMs);

    // A timeout must cost real elapsed time, otherwise the trace would show a
    // 0 ms "timeout" — which would misrepresent what a stalled provider does.
    if (context.demoBehaviour?.forceTimeout) {
      const stall = Math.min(SIMULATED_TIMEOUT_MS, context.timeoutMs);
      await sleep(stall);
      throw new ProviderError(
        buildNormalisedError('TIMEOUT', {
          message: `Demo provider did not respond within ${stall} ms.`,
        }),
      );
    }

    const latencyMs =
      context.demoBehaviour?.forceLatencyMs ??
      Math.round(spec.baseLatencyMs + random() * spec.latencyJitterMs);

    await sleep(Math.min(latencyMs, 2_500));

    const prompt = lastUserMessage(request.messages);
    const content = request.structuredOutputSchema
      ? composeStructured(request.structuredOutputSchema, prompt, random)
      : composeAnswer(spec, prompt, random);

    const inputTokens = estimateMessagesTokens(request.messages);
    const outputTokens = estimateTokens(content);

    return {
      requestId: context.correlationId,
      provider: 'DEMO',
      model: spec.modelId,
      content,
      finishReason: 'stop',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      // Cost is computed centrally from the workspace's configured pricing.
      estimatedCost: 0,
      latencyMs,
      providerRequestId: `demo_${seed.toString(16)}`,
      metadata: {
        demo: true,
        disclaimer: DEMO_MODEL_DISCLAIMER,
        seed,
        displayName: spec.displayName,
      },
    };
  }

  async *streamChatCompletion(
    request: CompletionRequest,
    context: ProviderContext,
  ): AsyncIterable<StreamChunk> {
    const response = await this.chatCompletion(request, context);

    // Emit whole words so the stream reads naturally rather than mid-token.
    const words = response.content.split(/(\s+)/);
    const perChunkMs = Math.max(
      8,
      Math.round(response.latencyMs / Math.max(words.length, 1)),
    );

    for (const word of words) {
      await sleep(perChunkMs);
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
    return estimateTokens(text);
  }

  normaliseError(error: unknown): NormalisedError {
    if (error instanceof ProviderError) return error.toNormalised();

    return buildNormalisedError(categoriseThrown(error), {
      message: 'The demo provider failed unexpectedly.',
    });
  }

  supportsCapability(modelId: string, capability: Capability): boolean {
    if (!isDemoModelId(modelId)) return false;
    return DEMO_MODELS[modelId].capabilities.includes(capability);
  }
}

export const demoProvider = new DemoProvider();
