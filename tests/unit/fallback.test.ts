import { describe, expect, it, vi } from 'vitest';

import {
  backoffDelayMs,
  buildNormalisedError,
  categoriseHttpStatus,
  categoriseThrown,
  httpStatusFor,
  retryPolicyFor,
  SAFE_ERROR_MESSAGES,
} from '@/lib/ai/errors';
import { executeWithFallback } from '@/lib/ai/fallback/executor';
import { estimateCost, projectCost, roundCurrency } from '@/lib/ai/pricing';
import type { RouteCandidate } from '@/lib/ai/routing/types';
import {
  estimateMessagesTokens,
  estimateTokens,
  exceedsContextWindow,
  normaliseUsage,
} from '@/lib/ai/tokens';
import type { CompletionResponse, ProviderContext } from '@/lib/ai/types';
import { ProviderError } from '@/lib/ai/types';

function candidate(id: string, label = id): RouteCandidate {
  return {
    modelId: id,
    modelLabel: label,
    displayName: label,
    providerKind: 'DEMO',
    connectionId: 'conn-1',
    priority: 1,
    weight: 1,
    contextWindow: 32_000,
    capabilities: ['streaming'],
    inputPricePerMillion: 1,
    outputPricePerMillion: 2,
    projectedCost: 0.001,
    healthState: 'HEALTHY',
    recentLatencyMs: 100,
    recentSuccessRate: 1,
    recentSampleSize: 5,
    isAvailable: true,
    isDemoModel: true,
  };
}

function response(model: string): CompletionResponse {
  return {
    requestId: 'corr-1',
    provider: 'DEMO',
    model,
    content: 'ok',
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    estimatedCost: 0,
    latencyMs: 50,
    providerRequestId: 'p-1',
    metadata: {},
  };
}

const context: ProviderContext = { timeoutMs: 5_000, correlationId: 'corr-1' };

type Options = Parameters<typeof executeWithFallback>[0];

/**
 * Builds a fully typed options object. `invoke` is a required parameter rather
 * than an override so the compiler checks every call, instead of a cast hiding
 * a missing field.
 */
function baseOptions(
  invoke: Options['invoke'],
  overrides: Partial<Options> = {},
): Options {
  return {
    request: { messages: [{ role: 'user' as const, content: 'hi' }], model: 'a' },
    chain: [candidate('a'), candidate('b'), candidate('c')],
    maxAttempts: 3,
    attemptTimeoutMs: 5_000,
    totalTimeoutMs: 30_000,
    correlationId: 'corr-1',
    buildContext: () => context,
    classify: (_c: RouteCandidate, error: unknown) =>
      error instanceof ProviderError
        ? error.toNormalised()
        : buildNormalisedError('UNKNOWN'),
    invoke,
    // No real waiting in tests.
    sleep: async () => {},
    ...overrides,
  };
}

describe('fallback executor', () => {
  it('returns on the first success without touching later targets', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => response(c.modelLabel));

    const result = await executeWithFallback(baseOptions(invoke));

    expect(result.response?.model).toBe('a');
    expect(result.attempts).toHaveLength(1);
    expect(result.fallbackUsed).toBe(false);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('falls back to the next target when the first is unavailable', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel === 'a') {
        throw new ProviderError(buildNormalisedError('PROVIDER_UNAVAILABLE'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke));

    expect(result.response?.model).toBe('b');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts).toHaveLength(2);
    // PROVIDER_UNAVAILABLE has no same-target retry: waiting would not help.
    expect(result.attempts[0]?.modelLabel).toBe('a');
    expect(result.attempts[1]?.modelLabel).toBe('b');
  });

  it('retries the same target once on a timeout before falling back', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel === 'a') {
        throw new ProviderError(buildNormalisedError('TIMEOUT'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke));

    // Two attempts against 'a' (initial + one retry), then 'b'.
    expect(result.attempts.map((a) => a.modelLabel)).toEqual(['a', 'a', 'b']);
    expect(result.response?.model).toBe('b');
    expect(result.fallbackUsed).toBe(true);
  });

  it('does not retry an authentication failure against the same target', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel === 'a') {
        throw new ProviderError(buildNormalisedError('AUTHENTICATION'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke));

    expect(result.attempts.map((a) => a.modelLabel)).toEqual(['a', 'b']);
  });

  it('stops immediately on an invalid request rather than trying other targets', async () => {
    const invoke = vi.fn(async () => {
      throw new ProviderError(buildNormalisedError('INVALID_REQUEST'));
    });

    const result = await executeWithFallback(baseOptions(invoke));

    // A malformed request fails identically everywhere, so fallback is pointless.
    expect(result.attempts).toHaveLength(1);
    expect(result.response).toBeNull();
    expect(result.finalError?.category).toBe('INVALID_REQUEST');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('never routes around a safety refusal', async () => {
    const invoke = vi.fn(async () => {
      throw new ProviderError(buildNormalisedError('SAFETY_REFUSAL'));
    });

    const result = await executeWithFallback(baseOptions(invoke));

    expect(result.attempts).toHaveLength(1);
    expect(result.finalError?.category).toBe('SAFETY_REFUSAL');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('respects the attempt ceiling', async () => {
    const invoke = vi.fn(async () => {
      throw new ProviderError(buildNormalisedError('PROVIDER_UNAVAILABLE'));
    });

    const result = await executeWithFallback(
      baseOptions(invoke, {
        maxAttempts: 2,
        chain: [candidate('a'), candidate('b'), candidate('c'), candidate('d')],
      }),
    );

    expect(result.attempts).toHaveLength(2);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('stops when the total timeout budget is exhausted', async () => {
    let now = 0;
    const invoke = vi.fn(async () => {
      now += 1_000;
      throw new ProviderError(buildNormalisedError('PROVIDER_UNAVAILABLE'));
    });

    const result = await executeWithFallback(
      baseOptions(invoke, {
        totalTimeoutMs: 1_500,
        maxAttempts: 10,
        now: () => now,
        chain: [candidate('a'), candidate('b'), candidate('c')],
      }),
    );

    expect(result.finalError?.category).toBe('TIMEOUT');
    expect(result.attempts.length).toBeLessThan(3);
  });

  it('records only the successful attempt as billable usage', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel === 'a') {
        throw new ProviderError(buildNormalisedError('PROVIDER_UNAVAILABLE'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke));

    // A failed attempt must never contribute tokens or cost.
    expect(result.attempts[0]?.inputTokens).toBe(0);
    expect(result.attempts[0]?.estimatedCost).toBe(0);
    expect(result.attempts[1]?.inputTokens).toBe(10);
    expect(result.attempts[1]?.estimatedCost).toBeGreaterThan(0);
  });

  it('numbers attempts sequentially from one', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel !== 'c') {
        throw new ProviderError(buildNormalisedError('PROVIDER_UNAVAILABLE'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke));

    expect(result.attempts.map((a) => a.sequence)).toEqual([1, 2, 3]);
  });

  it('marks a timed-out attempt distinctly from a generic failure', async () => {
    const invoke = vi.fn(async (c: RouteCandidate) => {
      if (c.modelLabel === 'a') {
        throw new ProviderError(buildNormalisedError('TIMEOUT'));
      }
      return response(c.modelLabel);
    });

    const result = await executeWithFallback(baseOptions(invoke, { maxAttempts: 5 }));

    expect(result.attempts[0]?.status).toBe('TIMED_OUT');
  });

  it('returns a safe error when the chain is empty', async () => {
    const result = await executeWithFallback(
      baseOptions(
        vi.fn(async () => response('unused')),
        { chain: [] },
      ),
    );

    expect(result.response).toBeNull();
    expect(result.attempts).toHaveLength(0);
    expect(result.finalError).not.toBeNull();
  });
});

describe('error classification', () => {
  it('maps HTTP statuses to categories', () => {
    expect(categoriseHttpStatus(401)).toBe('AUTHENTICATION');
    expect(categoriseHttpStatus(403)).toBe('PERMISSION');
    expect(categoriseHttpStatus(408)).toBe('TIMEOUT');
    expect(categoriseHttpStatus(413)).toBe('CONTEXT_LIMIT');
    expect(categoriseHttpStatus(422)).toBe('INVALID_REQUEST');
    expect(categoriseHttpStatus(429)).toBe('RATE_LIMIT');
    expect(categoriseHttpStatus(500)).toBe('PROVIDER_UNAVAILABLE');
    expect(categoriseHttpStatus(503)).toBe('PROVIDER_UNAVAILABLE');
    expect(categoriseHttpStatus(400)).toBe('INVALID_REQUEST');
    expect(categoriseHttpStatus(200)).toBe('UNKNOWN');
  });

  it('classifies thrown network and abort errors', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(categoriseThrown(abort)).toBe('TIMEOUT');
    expect(categoriseThrown(new Error('ECONNREFUSED'))).toBe('NETWORK');
    expect(categoriseThrown(new Error('fetch failed'))).toBe('NETWORK');
    expect(categoriseThrown('a string')).toBe('UNKNOWN');
  });

  it('blocks fallback for categories where it cannot help', () => {
    expect(retryPolicyFor('INVALID_REQUEST').allowFallback).toBe(false);
    expect(retryPolicyFor('SAFETY_REFUSAL').allowFallback).toBe(false);
    expect(retryPolicyFor('QUOTA_EXCEEDED').allowFallback).toBe(false);
  });

  it('never retries an authentication failure', () => {
    expect(retryPolicyFor('AUTHENTICATION').retrySameTarget).toBe(false);
    expect(retryPolicyFor('AUTHENTICATION').maxRetries).toBe(0);
  });

  it('gives every category a rationale and a safe message', () => {
    for (const category of Object.keys(SAFE_ERROR_MESSAGES) as Array<
      keyof typeof SAFE_ERROR_MESSAGES
    >) {
      expect(retryPolicyFor(category).rationale.length).toBeGreaterThan(20);
      expect(SAFE_ERROR_MESSAGES[category].length).toBeGreaterThan(10);
    }
  });

  it('maps categories to sensible HTTP statuses', () => {
    expect(httpStatusFor('AUTHENTICATION')).toBe(401);
    expect(httpStatusFor('PERMISSION')).toBe(403);
    expect(httpStatusFor('RATE_LIMIT')).toBe(429);
    expect(httpStatusFor('QUOTA_EXCEEDED')).toBe(429);
    expect(httpStatusFor('TIMEOUT')).toBe(504);
    expect(httpStatusFor('PROVIDER_UNAVAILABLE')).toBe(502);
    // A refusal is a legitimate answer, not a transport failure.
    expect(httpStatusFor('SAFETY_REFUSAL')).toBe(200);
  });

  it('produces bounded jittered backoff', () => {
    // Full jitter: the delay is between zero and the exponential ceiling.
    expect(backoffDelayMs('RATE_LIMIT', 1, () => 1)).toBe(500);
    expect(backoffDelayMs('RATE_LIMIT', 2, () => 1)).toBe(1_000);
    expect(backoffDelayMs('RATE_LIMIT', 1, () => 0)).toBe(0);
    // Categories that never retry have no delay.
    expect(backoffDelayMs('AUTHENTICATION', 1, () => 1)).toBe(0);
  });
});

describe('tokens and pricing', () => {
  it('estimates zero tokens for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('scales with text length', () => {
    expect(estimateTokens('word '.repeat(100))).toBeGreaterThan(
      estimateTokens('word '.repeat(10)),
    );
  });

  it('adds per-message overhead', () => {
    const single = estimateMessagesTokens([{ role: 'user', content: 'hello' }]);
    const double = estimateMessagesTokens([
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'hello' },
    ]);
    expect(double).toBeGreaterThan(single * 1.5);
  });

  it('prefers provider-reported usage over an estimate', () => {
    const usage = normaliseUsage(
      { inputTokens: 100, outputTokens: 200 },
      { inputTokens: 1, outputTokens: 2 },
    );
    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
    });
  });

  it('falls back to the estimate when usage is absent', () => {
    expect(normaliseUsage(null, { inputTokens: 5, outputTokens: 7 })).toEqual({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12,
    });
  });

  it('never returns a negative token count', () => {
    const usage = normaliseUsage(
      { inputTokens: -5, outputTokens: -1 },
      { inputTokens: 0, outputTokens: 0 },
    );
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it('detects when a prompt cannot fit alongside the requested output', () => {
    expect(exceedsContextWindow(7_000, 2_000, 8_000)).toBe(true);
    expect(exceedsContextWindow(4_000, 2_000, 8_000)).toBe(false);
  });

  it('computes cost from per-million pricing', () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, totalTokens: 2_000_000 },
      { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    );
    expect(cost).toBe(18);
  });

  it('retains sub-cent precision rather than rounding to zero', () => {
    const cost = estimateCost(
      { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    );
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.0001);
  });

  it('returns zero for a free model', () => {
    expect(
      projectCost(1000, 1000, {
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
      }),
    ).toBe(0);
  });

  it('rounds to six decimal places, matching the column precision', () => {
    expect(roundCurrency(0.1234567891)).toBe(0.123457);
  });
});
