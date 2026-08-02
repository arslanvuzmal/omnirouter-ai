import { describe, expect, it } from 'vitest';

import { evaluateRoute } from '@/lib/ai/routing/engine';
import type { RouteCandidate, RouteInput } from '@/lib/ai/routing/types';
import { DEFAULT_SCORING_WEIGHTS } from '@/lib/ai/routing/types';

/**
 * Routing engine.
 *
 * evaluateRoute is pure and takes its live signals as arguments, so every
 * strategy can be asserted without a database or a provider.
 */

function candidate(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    modelId: 'model-a',
    modelLabel: 'alpha',
    displayName: 'Alpha',
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
    recentLatencyMs: 500,
    recentSuccessRate: 1,
    recentSampleSize: 10,
    isAvailable: true,
    isDemoModel: true,
    ...overrides,
  };
}

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    policyId: 'policy-1',
    policyName: 'Test policy',
    strategy: 'PRIORITY',
    candidates: [candidate()],
    requirements: {
      capabilities: [],
      minContextWindow: 100,
      maxEstimatedCost: null,
    },
    weights: DEFAULT_SCORING_WEIGHTS,
    ...overrides,
  };
}

describe('routing: eligibility filtering', () => {
  it('rejects an unavailable model and records why', () => {
    const result = evaluateRoute(
      input({
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', isAvailable: false }),
          candidate({ modelId: 'b', modelLabel: 'beta' }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
    expect(
      result.explanation.rejectedCandidates.find((c) => c.modelLabel === 'alpha')?.reason,
    ).toBe('unavailable');
  });

  it('rejects a model whose provider is unavailable', () => {
    const result = evaluateRoute(
      input({
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', healthState: 'UNAVAILABLE' }),
          candidate({ modelId: 'b', modelLabel: 'beta' }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
    expect(
      result.explanation.rejectedCandidates.find((c) => c.modelLabel === 'alpha')?.reason,
    ).toBe('unhealthy');
  });

  it('keeps a degraded model eligible rather than removing it', () => {
    const result = evaluateRoute(
      input({ candidates: [candidate({ healthState: 'DEGRADED' })] }),
    );

    expect(result.selected).not.toBeNull();
  });

  it('rejects a model missing a required capability', () => {
    const result = evaluateRoute(
      input({
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', capabilities: ['streaming'] }),
          candidate({
            modelId: 'b',
            modelLabel: 'beta',
            capabilities: ['streaming', 'structured_output'],
          }),
        ],
        requirements: {
          capabilities: ['structured_output'],
          minContextWindow: 100,
          maxEstimatedCost: null,
        },
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
    expect(
      result.explanation.rejectedCandidates.find((c) => c.modelLabel === 'alpha')?.reason,
    ).toBe('missing_capability');
  });

  it('rejects a model whose context window is too small', () => {
    const result = evaluateRoute(
      input({
        candidates: [candidate({ contextWindow: 1_000 })],
        requirements: {
          capabilities: [],
          minContextWindow: 8_000,
          maxEstimatedCost: null,
        },
      }),
    );

    expect(result.selected).toBeNull();
    expect(result.explanation.rejectedCandidates[0]?.reason).toBe('context_too_small');
  });

  it('rejects a model above the policy cost ceiling', () => {
    const result = evaluateRoute(
      input({
        candidates: [candidate({ projectedCost: 5 })],
        requirements: {
          capabilities: [],
          minContextWindow: 100,
          maxEstimatedCost: 0.01,
        },
      }),
    );

    expect(result.selected).toBeNull();
    expect(result.explanation.rejectedCandidates[0]?.reason).toBe('exceeds_cost_ceiling');
  });

  it('explains an empty candidate list without throwing', () => {
    const result = evaluateRoute(input({ candidates: [] }));

    expect(result.selected).toBeNull();
    expect(result.explanation.reason).toContain('no models attached');
  });
});

describe('routing: strategies', () => {
  it('PRIORITY selects the lowest priority number', () => {
    const result = evaluateRoute(
      input({
        strategy: 'PRIORITY',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', priority: 3 }),
          candidate({ modelId: 'b', modelLabel: 'beta', priority: 1 }),
          candidate({ modelId: 'c', modelLabel: 'gamma', priority: 2 }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
    expect(result.explanation.fallbackOrder).toEqual(['gamma', 'alpha']);
  });

  it('LOWEST_ESTIMATED_COST selects the cheapest projection', () => {
    const result = evaluateRoute(
      input({
        strategy: 'LOWEST_ESTIMATED_COST',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', projectedCost: 0.01 }),
          candidate({ modelId: 'b', modelLabel: 'beta', projectedCost: 0.001 }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
  });

  it('LOWEST_RECENT_LATENCY ranks a model with no samples after one with evidence', () => {
    const result = evaluateRoute(
      input({
        strategy: 'LOWEST_RECENT_LATENCY',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', recentLatencyMs: null }),
          candidate({ modelId: 'b', modelLabel: 'beta', recentLatencyMs: 900 }),
        ],
      }),
    );

    // A model with no measurement is not treated as infinitely fast.
    expect(result.selected?.modelLabel).toBe('beta');
  });

  it('RELIABILITY_FIRST prefers health, then success rate', () => {
    const result = evaluateRoute(
      input({
        strategy: 'RELIABILITY_FIRST',
        candidates: [
          candidate({
            modelId: 'a',
            modelLabel: 'alpha',
            healthState: 'DEGRADED',
            recentSuccessRate: 1,
          }),
          candidate({
            modelId: 'b',
            modelLabel: 'beta',
            healthState: 'HEALTHY',
            recentSuccessRate: 0.8,
          }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
  });

  it('CAPABILITY_MATCH prefers the largest context window', () => {
    const result = evaluateRoute(
      input({
        strategy: 'CAPABILITY_MATCH',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', contextWindow: 32_000 }),
          candidate({ modelId: 'b', modelLabel: 'beta', contextWindow: 200_000 }),
        ],
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
  });

  it('MANUAL selects only the pinned model', () => {
    const result = evaluateRoute(
      input({
        strategy: 'MANUAL',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha' }),
          candidate({ modelId: 'b', modelLabel: 'beta' }),
        ],
        requirements: {
          capabilities: [],
          minContextWindow: 100,
          maxEstimatedCost: null,
          pinnedModelId: 'b',
        },
      }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
    // A pinned selection has no fallback chain: substituting a different model
    // would defeat the point of pinning one.
    expect(result.fallbackChain).toHaveLength(0);
  });

  it('WEIGHTED is deterministic given a seeded random source', () => {
    const candidates = [
      candidate({ modelId: 'a', modelLabel: 'alpha', weight: 1 }),
      candidate({ modelId: 'b', modelLabel: 'beta', weight: 99 }),
    ];

    // A draw near the top of the range must land on the heavily weighted target.
    const result = evaluateRoute(
      input({ strategy: 'WEIGHTED', candidates, random: () => 0.99 }),
    );

    expect(result.selected?.modelLabel).toBe('beta');
  });

  it('WEIGHTED orders the whole chain, not just the head', () => {
    const result = evaluateRoute(
      input({
        strategy: 'WEIGHTED',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', weight: 1 }),
          candidate({ modelId: 'b', modelLabel: 'beta', weight: 1 }),
          candidate({ modelId: 'c', modelLabel: 'gamma', weight: 1 }),
        ],
        random: () => 0.5,
      }),
    );

    expect(result.fallbackChain).toHaveLength(2);
    expect(result.explanation.fallbackOrder).toHaveLength(2);
  });

  it('BALANCED produces a score breakdown for every eligible candidate', () => {
    const result = evaluateRoute(
      input({
        strategy: 'BALANCED',
        candidates: [
          candidate({
            modelId: 'a',
            modelLabel: 'alpha',
            projectedCost: 0.01,
            recentLatencyMs: 2_000,
          }),
          candidate({
            modelId: 'b',
            modelLabel: 'beta',
            projectedCost: 0.001,
            recentLatencyMs: 300,
          }),
        ],
      }),
    );

    expect(result.explanation.scoreBreakdown).toHaveLength(2);
    // Cheaper and faster should win under the default weights.
    expect(result.selected?.modelLabel).toBe('beta');

    const factors = result.explanation.scoreBreakdown[0]?.components.map(
      (component) => component.factor,
    );
    expect(factors).toEqual(['health', 'successRate', 'latency', 'cost', 'preference']);
  });

  it('BALANCED contributions never exceed their configured weight', () => {
    const result = evaluateRoute(
      input({
        strategy: 'BALANCED',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha' }),
          candidate({ modelId: 'b', modelLabel: 'beta', projectedCost: 9 }),
        ],
      }),
    );

    for (const entry of result.explanation.scoreBreakdown) {
      for (const component of entry.components) {
        expect(component.contribution).toBeLessThanOrEqual(component.weight);
        expect(component.normalised).toBeGreaterThanOrEqual(0);
        expect(component.normalised).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('routing: explanation', () => {
  it('accounts for every candidate as selected, rejected or not selected', () => {
    const result = evaluateRoute(
      input({
        strategy: 'PRIORITY',
        candidates: [
          candidate({ modelId: 'a', modelLabel: 'alpha', priority: 1 }),
          candidate({ modelId: 'b', modelLabel: 'beta', priority: 2 }),
          candidate({ modelId: 'c', modelLabel: 'gamma', isAvailable: false }),
        ],
      }),
    );

    expect(result.explanation.candidates).toHaveLength(3);
    expect(result.explanation.selectedCandidate?.modelLabel).toBe('alpha');
    // beta ranked lower, gamma was filtered out — both must be explained.
    expect(result.explanation.rejectedCandidates).toHaveLength(2);
  });

  it('records fallback order using labels rather than internal ids', () => {
    const result = evaluateRoute(
      input({
        strategy: 'PRIORITY',
        candidates: [
          candidate({ modelId: 'internal-id-1', modelLabel: 'alpha', priority: 1 }),
          candidate({ modelId: 'internal-id-2', modelLabel: 'beta', priority: 2 }),
        ],
      }),
    );

    expect(result.explanation.fallbackOrder).toEqual(['beta']);
  });

  it('never claims a strategy found the objectively best model', () => {
    const result = evaluateRoute(input({ strategy: 'BALANCED' }));

    expect(result.explanation.reason).toContain('configured scoring policy');
    expect(result.explanation.reason.toLowerCase()).not.toContain('best model');
  });
});
