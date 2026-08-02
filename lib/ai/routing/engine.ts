import type { HealthState } from '@/lib/database/generated/enums';

import type {
  RejectedCandidate,
  RouteCandidate,
  RouteExplanation,
  RouteInput,
  RouteRequirements,
  RouteResult,
  ScoreComponent,
  ScoredCandidate,
  ScoringWeights,
} from './types';
import { DEFAULT_SCORING_WEIGHTS } from './types';

/**
 * Routing engine.
 *
 * Eight strategies share one pipeline:
 *
 *   filter -> (strategy-specific order) -> select head -> explain
 *
 * Filtering is common to every strategy so that eligibility rules stay in one
 * place, and every rejection is recorded with a reason rather than silently
 * dropped. The ordered remainder becomes the fallback chain, which means
 * fallback is never an afterthought — it is the same ranking, minus the head.
 */

const HEALTH_SCORE: Record<HealthState, number> = {
  HEALTHY: 1,
  UNKNOWN: 0.6,
  DEGRADED: 0.3,
  UNAVAILABLE: 0,
};

/** Latency above this is treated as maximally bad when normalising. */
const LATENCY_CEILING_MS = 5_000;

interface FilterOutcome {
  eligible: RouteCandidate[];
  rejected: RejectedCandidate[];
}

function filterCandidates(
  candidates: RouteCandidate[],
  requirements: RouteRequirements,
): FilterOutcome {
  const eligible: RouteCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.isAvailable) {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'unavailable',
        detail: 'The model is marked unavailable in the workspace catalogue.',
      });
      continue;
    }

    if (candidate.healthState === 'UNAVAILABLE') {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'unhealthy',
        detail: 'The most recent health check reported this provider as unavailable.',
      });
      continue;
    }

    if (requirements.excludeProviderKinds?.includes(candidate.providerKind)) {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'provider_excluded',
        detail: `Provider ${candidate.providerKind} is excluded by this policy.`,
      });
      continue;
    }

    const missing = requirements.capabilities.filter(
      (capability) => !candidate.capabilities.includes(capability),
    );

    if (missing.length > 0) {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'missing_capability',
        detail: `Does not support required capability: ${missing.join(', ')}.`,
      });
      continue;
    }

    if (candidate.contextWindow < requirements.minContextWindow) {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'context_too_small',
        detail: `Context window of ${candidate.contextWindow.toLocaleString()} tokens is below the ${requirements.minContextWindow.toLocaleString()} required.`,
      });
      continue;
    }

    if (
      requirements.maxEstimatedCost !== null &&
      candidate.projectedCost > requirements.maxEstimatedCost
    ) {
      rejected.push({
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        reason: 'exceeds_cost_ceiling',
        detail: `Projected cost of $${candidate.projectedCost.toFixed(6)} exceeds the policy ceiling of $${requirements.maxEstimatedCost.toFixed(6)}.`,
      });
      continue;
    }

    eligible.push(candidate);
  }

  return { eligible, rejected };
}

function byPriority(a: RouteCandidate, b: RouteCandidate): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.modelLabel.localeCompare(b.modelLabel);
}

function byCost(a: RouteCandidate, b: RouteCandidate): number {
  if (a.projectedCost !== b.projectedCost) {
    return a.projectedCost - b.projectedCost;
  }
  return byPriority(a, b);
}

function byLatency(a: RouteCandidate, b: RouteCandidate): number {
  // A model with no samples yet is ranked after any model with evidence, rather
  // than being treated as infinitely fast.
  const left = a.recentLatencyMs ?? Number.POSITIVE_INFINITY;
  const right = b.recentLatencyMs ?? Number.POSITIVE_INFINITY;
  if (left !== right) return left - right;
  return byPriority(a, b);
}

function byReliability(a: RouteCandidate, b: RouteCandidate): number {
  const healthDelta = HEALTH_SCORE[b.healthState] - HEALTH_SCORE[a.healthState];
  if (healthDelta !== 0) return healthDelta;

  const left = a.recentSuccessRate ?? 0;
  const right = b.recentSuccessRate ?? 0;
  if (left !== right) return right - left;

  return byPriority(a, b);
}

/** Wider context window first; ties fall back to priority. */
function byCapacity(a: RouteCandidate, b: RouteCandidate): number {
  if (a.contextWindow !== b.contextWindow) {
    return b.contextWindow - a.contextWindow;
  }
  return byPriority(a, b);
}

/**
 * Weighted selection without replacement.
 *
 * Draws the head by weight, then repeats over the remainder so the fallback
 * chain is itself weight-ordered rather than arbitrary.
 */
function weightedOrder(
  candidates: RouteCandidate[],
  random: () => number,
): RouteCandidate[] {
  const pool = [...candidates];
  const ordered: RouteCandidate[] = [];

  while (pool.length > 0) {
    const total = pool.reduce((sum, candidate) => sum + Math.max(0, candidate.weight), 0);

    if (total <= 0) {
      // All remaining weights are zero: fall back to deterministic order.
      ordered.push(...pool.sort(byPriority));
      break;
    }

    let ticket = random() * total;
    let index = 0;

    for (let position = 0; position < pool.length; position += 1) {
      ticket -= Math.max(0, pool[position]?.weight ?? 0);
      if (ticket <= 0) {
        index = position;
        break;
      }
      index = position;
    }

    const [picked] = pool.splice(index, 1);
    if (picked) ordered.push(picked);
  }

  return ordered;
}

function normalise(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return 1;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * BALANCED scoring.
 *
 * Each factor is normalised to [0,1] where higher is better, multiplied by its
 * configured weight, and summed. The per-factor breakdown is retained so the
 * interface can show exactly why one candidate outranked another.
 *
 * This is explicitly a *configured* score. It does not claim to identify the
 * objectively best model.
 */
function scoreCandidates(
  candidates: RouteCandidate[],
  weights: ScoringWeights,
): ScoredCandidate[] {
  const costs = candidates.map((candidate) => candidate.projectedCost);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);

  const latencies = candidates.map(
    (candidate) => candidate.recentLatencyMs ?? LATENCY_CEILING_MS,
  );
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);

  const priorities = candidates.map((candidate) => candidate.priority);
  const minPriority = Math.min(...priorities);
  const maxPriority = Math.max(...priorities);

  return candidates
    .map((candidate) => {
      const latency = candidate.recentLatencyMs ?? LATENCY_CEILING_MS;

      const components: ScoreComponent[] = [
        buildComponent(
          'health',
          HEALTH_SCORE[candidate.healthState],
          HEALTH_SCORE[candidate.healthState],
          weights.health,
        ),
        buildComponent(
          'successRate',
          candidate.recentSuccessRate ?? 0.5,
          // With no samples, 0.5 avoids both rewarding and punishing a new model.
          candidate.recentSuccessRate ?? 0.5,
          weights.successRate,
        ),
        buildComponent(
          'latency',
          latency,
          // Inverted: lower latency scores higher.
          1 - normalise(latency, minLatency, maxLatency),
          weights.latency,
        ),
        buildComponent(
          'cost',
          candidate.projectedCost,
          1 - normalise(candidate.projectedCost, minCost, maxCost),
          weights.cost,
        ),
        buildComponent(
          'preference',
          candidate.priority,
          1 - normalise(candidate.priority, minPriority, maxPriority),
          weights.preference,
        ),
      ];

      const score = components.reduce(
        (sum, component) => sum + component.contribution,
        0,
      );

      return {
        modelId: candidate.modelId,
        modelLabel: candidate.modelLabel,
        score: Math.round(score * 10_000) / 10_000,
        components,
      };
    })
    .sort((a, b) => b.score - a.score || a.modelLabel.localeCompare(b.modelLabel));
}

function buildComponent(
  factor: string,
  raw: number,
  normalised: number,
  weight: number,
): ScoreComponent {
  const bounded = Math.min(1, Math.max(0, normalised));

  return {
    factor,
    raw: Math.round(raw * 10_000) / 10_000,
    normalised: Math.round(bounded * 10_000) / 10_000,
    weight,
    contribution: Math.round(bounded * weight * 10_000) / 10_000,
  };
}

function describeSelection(
  strategy: RouteInput['strategy'],
  selected: RouteCandidate,
  eligibleCount: number,
): string {
  const suffix = `${eligibleCount} candidate${eligibleCount === 1 ? '' : 's'} were eligible.`;

  switch (strategy) {
    case 'MANUAL':
      return `${selected.displayName} was requested explicitly, so no scoring was applied.`;
    case 'PRIORITY':
      return `${selected.displayName} holds the lowest priority number (${selected.priority}) among eligible targets. ${suffix}`;
    case 'WEIGHTED':
      return `${selected.displayName} was drawn by weighted random selection (weight ${selected.weight}). ${suffix}`;
    case 'LOWEST_ESTIMATED_COST':
      return `${selected.displayName} has the lowest projected cost ($${selected.projectedCost.toFixed(6)}) among targets meeting the requirements. ${suffix}`;
    case 'LOWEST_RECENT_LATENCY':
      return selected.recentLatencyMs === null
        ? `${selected.displayName} was selected; no recent latency samples were available, so configured priority decided the order. ${suffix}`
        : `${selected.displayName} recorded the lowest recent mean latency (${Math.round(selected.recentLatencyMs)} ms). ${suffix}`;
    case 'RELIABILITY_FIRST':
      return `${selected.displayName} is ${selected.healthState.toLowerCase()} with a recent success rate of ${formatRate(selected.recentSuccessRate)}. ${suffix}`;
    case 'CAPABILITY_MATCH':
      return `${selected.displayName} satisfies every required capability and offers the largest context window (${selected.contextWindow.toLocaleString()} tokens). ${suffix}`;
    case 'BALANCED':
      return `${selected.displayName} scored highest against the configured scoring policy. ${suffix}`;
    default:
      return `${selected.displayName} was selected. ${suffix}`;
  }
}

function formatRate(rate: number | null): string {
  if (rate === null) return 'no samples yet';
  return `${Math.round(rate * 100)}%`;
}

/**
 * Evaluates a policy against the supplied candidates.
 *
 * Pure and synchronous: all live signals (health, latency, success rate) are
 * resolved by the caller and passed in, which keeps this unit-testable without
 * a database.
 */
export function evaluateRoute(input: RouteInput): RouteResult {
  const random = input.random ?? Math.random;
  const weights = input.weights ?? DEFAULT_SCORING_WEIGHTS;

  const { eligible, rejected } = filterCandidates(input.candidates, input.requirements);

  let ordered: RouteCandidate[] = [];
  let scoreBreakdown: ScoredCandidate[] = [];

  if (eligible.length > 0) {
    switch (input.strategy) {
      case 'MANUAL': {
        const pinned = input.requirements.pinnedModelId;
        ordered = pinned
          ? eligible.filter((candidate) => candidate.modelId === pinned)
          : eligible.slice(0, 1);
        break;
      }
      case 'PRIORITY':
        ordered = [...eligible].sort(byPriority);
        break;
      case 'WEIGHTED':
        ordered = weightedOrder(eligible, random);
        break;
      case 'LOWEST_ESTIMATED_COST':
        ordered = [...eligible].sort(byCost);
        break;
      case 'LOWEST_RECENT_LATENCY':
        ordered = [...eligible].sort(byLatency);
        break;
      case 'RELIABILITY_FIRST':
        ordered = [...eligible].sort(byReliability);
        break;
      case 'CAPABILITY_MATCH':
        ordered = [...eligible].sort(byCapacity);
        break;
      case 'BALANCED': {
        scoreBreakdown = scoreCandidates(eligible, weights);
        const rank = new Map(
          scoreBreakdown.map((entry, index) => [entry.modelId, index]),
        );
        ordered = [...eligible].sort(
          (a, b) =>
            (rank.get(a.modelId) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(b.modelId) ?? Number.MAX_SAFE_INTEGER),
        );
        break;
      }
      default:
        ordered = [...eligible].sort(byPriority);
    }
  }

  const selected = ordered[0] ?? null;
  const fallbackChain = ordered.slice(1);

  // Candidates that passed filtering but lost the ranking are recorded too, so
  // the explanation accounts for every candidate considered.
  const notSelected: RejectedCandidate[] = fallbackChain.map((candidate) => ({
    modelId: candidate.modelId,
    modelLabel: candidate.modelLabel,
    reason: 'not_selected',
    detail: 'Eligible, but ranked below the selected target. Retained for fallback.',
  }));

  const explanation: RouteExplanation = {
    policyId: input.policyId,
    policyName: input.policyName,
    strategy: input.strategy,
    candidates: input.candidates.map((candidate) => ({
      modelId: candidate.modelId,
      modelLabel: candidate.modelLabel,
      providerKind: candidate.providerKind,
      priority: candidate.priority,
      weight: candidate.weight,
      projectedCost: candidate.projectedCost,
      recentLatencyMs: candidate.recentLatencyMs,
      recentSuccessRate: candidate.recentSuccessRate,
      healthState: candidate.healthState,
    })),
    rejectedCandidates: [...rejected, ...notSelected],
    selectedCandidate: selected
      ? {
          modelId: selected.modelId,
          modelLabel: selected.modelLabel,
          providerKind: selected.providerKind,
        }
      : null,
    reason: selected
      ? describeSelection(input.strategy, selected, eligible.length)
      : buildNoCandidateReason(input.candidates.length, rejected),
    scoreBreakdown,
    // Labels, not internal ids: this field is read by a human in the trace.
    fallbackOrder: fallbackChain.map((candidate) => candidate.modelLabel),
    evaluatedAt: new Date().toISOString(),
  };

  return { selected, fallbackChain, explanation };
}

function buildNoCandidateReason(
  totalCandidates: number,
  rejected: RejectedCandidate[],
): string {
  if (totalCandidates === 0) {
    return 'This policy has no models attached, so there was nothing to route to.';
  }

  const grouped = new Map<string, number>();
  for (const entry of rejected) {
    grouped.set(entry.reason, (grouped.get(entry.reason) ?? 0) + 1);
  }

  const summary = [...grouped.entries()]
    .map(([reason, count]) => `${count} × ${reason.replace(/_/g, ' ')}`)
    .join(', ');

  return `No eligible target remained after filtering ${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'} (${summary}).`;
}

export { DEFAULT_SCORING_WEIGHTS };
export { HEALTH_SCORE, LATENCY_CEILING_MS };
