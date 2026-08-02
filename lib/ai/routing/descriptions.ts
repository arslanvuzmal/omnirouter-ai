import type { RoutingStrategy } from '@/lib/database/generated/enums';

/**
 * Operator-facing descriptions of each strategy.
 *
 * Deliberately worded to avoid implying that any strategy identifies an
 * objectively best model — each one expresses a configured preference.
 */
export const STRATEGY_SUMMARIES: Record<RoutingStrategy, string> = {
  MANUAL:
    'Uses the model named in the request. No scoring is applied, and no alternative is substituted.',
  PRIORITY:
    'Tries eligible targets strictly in their configured order, lowest priority number first.',
  WEIGHTED:
    'Draws a target at random in proportion to its configured weight, then orders the remainder the same way for fallback.',
  LOWEST_ESTIMATED_COST:
    'Chooses the lowest projected cost among targets that meet the capability and context requirements.',
  LOWEST_RECENT_LATENCY:
    'Chooses the target with the lowest mean latency across recent successful attempts. A target with no samples ranks after one with evidence.',
  RELIABILITY_FIRST:
    'Chooses the healthiest target, breaking ties on recent success rate.',
  CAPABILITY_MATCH:
    'Filters to targets that satisfy every required capability, then prefers the largest context window.',
  BALANCED:
    'Scores each target on health, recent success rate, latency, cost and configured preference, then selects the highest total. The weights are a workspace setting, not a universal ranking.',
};

export const STRATEGY_SHORT: Record<RoutingStrategy, string> = {
  MANUAL: 'Explicit model',
  PRIORITY: 'Configured order',
  WEIGHTED: 'Weighted random',
  LOWEST_ESTIMATED_COST: 'Cheapest capable',
  LOWEST_RECENT_LATENCY: 'Fastest recently',
  RELIABILITY_FIRST: 'Healthiest',
  CAPABILITY_MATCH: 'Capability fit',
  BALANCED: 'Weighted score',
};
