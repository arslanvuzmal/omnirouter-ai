import type { DemoBehaviour } from '@/lib/ai/types';

/**
 * The seventeen demonstration scenarios.
 *
 * Each one is executed against the real gateway during seeding, so the request
 * rows, attempt rows and route explanations behind the dashboard are genuine
 * output from the same code path that serves live traffic — not fixtures.
 */

export interface ScenarioDefinition {
  key: string;
  title: string;
  description: string;
  /** Which seeded application this scenario runs against. */
  applicationSlug: string;
  environment: 'DEVELOPMENT' | 'PRODUCTION';
  /** Named policy to route with; null uses the environment default. */
  policyName: string | null;
  prompt: string;
  systemPrompt?: string;
  behaviour?: DemoBehaviour;
  /**
   * How widely the fault applies. 'first_candidate' makes the primary target
   * fail on every attempt, so the request genuinely falls back to a different
   * model rather than recovering on a same-target retry.
   */
  scope?: 'all' | 'first_attempt' | 'first_candidate';
  structuredOutput?: boolean;
  /** Expected outcome, asserted by demo:verify. */
  expect: 'success' | 'success_with_fallback' | 'failure' | 'rejected';
  sortOrder: number;
}

export const DEMO_SCENARIOS: ScenarioDefinition[] = [
  {
    key: 'balanced-normal',
    title: 'Normal balanced request',
    description:
      'A routine request routed by the balanced scoring policy with every provider healthy.',
    applicationSlug: 'support-copilot',
    environment: 'PRODUCTION',
    policyName: 'Balanced production',
    prompt:
      'Summarise this support thread and suggest the next action for the agent.',
    systemPrompt: 'You are a concise support operations assistant.',
    expect: 'success',
    sortOrder: 1,
  },
  {
    key: 'cost-aware',
    title: 'Cost-aware route',
    description:
      'The policy selects the cheapest model that still meets the capability requirements.',
    applicationSlug: 'bulk-classifier',
    environment: 'PRODUCTION',
    policyName: 'Lowest cost bulk',
    prompt: 'Classify this ticket as billing, technical, or account access.',
    expect: 'success',
    sortOrder: 2,
  },
  {
    key: 'latency-aware',
    title: 'Latency-aware route',
    description:
      'Selection driven by recent measured latency rather than configured priority.',
    applicationSlug: 'support-copilot',
    environment: 'PRODUCTION',
    policyName: 'Fastest response',
    prompt: 'Draft a one-sentence acknowledgement for this customer.',
    expect: 'success',
    sortOrder: 3,
  },
  {
    key: 'capability-structured',
    title: 'Capability-based structured output',
    description:
      'Models without structured-output support are filtered out before scoring.',
    applicationSlug: 'bulk-classifier',
    environment: 'DEVELOPMENT',
    policyName: 'Structured extraction',
    prompt: 'Extract the customer name, sentiment and priority from this message.',
    structuredOutput: true,
    expect: 'success',
    sortOrder: 4,
  },
  {
    key: 'timeout-fallback',
    title: 'Provider timeout with fallback',
    description:
      'The primary target times out; the classified retry policy moves to the next target, which succeeds.',
    applicationSlug: 'support-copilot',
    environment: 'PRODUCTION',
    policyName: 'Balanced production',
    prompt: 'Summarise the outage timeline for the incident report.',
    behaviour: { forceTimeout: true },
    scope: 'first_candidate',
    expect: 'success_with_fallback',
    sortOrder: 5,
  },
  {
    key: 'rate-limit-fallback',
    title: 'Provider rate limit with fallback',
    description:
      'A 429 triggers one backed-off retry, then a fallback target completes the request.',
    applicationSlug: 'bulk-classifier',
    environment: 'PRODUCTION',
    policyName: 'Lowest cost bulk',
    prompt: 'Categorise this batch of incoming messages.',
    behaviour: { forceRateLimit: true },
    scope: 'first_candidate',
    expect: 'success_with_fallback',
    sortOrder: 6,
  },
  {
    key: 'provider-unavailable',
    title: 'Provider unavailable',
    description:
      'A 503 causes immediate fallback with no retry, because waiting would not help.',
    applicationSlug: 'support-copilot',
    environment: 'PRODUCTION',
    policyName: 'Balanced production',
    prompt: 'Rewrite this reply in a warmer tone.',
    behaviour: { forceUnavailable: true },
    scope: 'first_candidate',
    expect: 'success_with_fallback',
    sortOrder: 7,
  },
  {
    key: 'safety-refusal',
    title: 'Safety refusal is not bypassed',
    description:
      'A refusal is returned to the caller rather than retried against another provider.',
    applicationSlug: 'support-copilot',
    environment: 'DEVELOPMENT',
    policyName: 'Balanced production',
    prompt: 'A request the model declines to answer.',
    behaviour: { forceSafetyRefusal: true },
    expect: 'failure',
    sortOrder: 8,
  },
  {
    key: 'context-limit',
    title: 'Context limit rejected',
    description:
      'Content is never silently truncated; the caller receives a clear error.',
    applicationSlug: 'bulk-classifier',
    environment: 'DEVELOPMENT',
    policyName: 'Structured extraction',
    prompt: 'A request that exceeds the context window of every eligible model.',
    behaviour: { forceContextLimit: true },
    expect: 'failure',
    sortOrder: 9,
  },
  {
    key: 'auth-failure',
    title: 'Misconfigured credential',
    description:
      'An authentication failure is never retried; the connection is flagged for an administrator.',
    applicationSlug: 'support-copilot',
    environment: 'DEVELOPMENT',
    policyName: 'Balanced production',
    prompt: 'Any request against a connection with an invalid credential.',
    behaviour: { forceAuthFailure: true },
    scope: 'first_candidate',
    expect: 'success_with_fallback',
    sortOrder: 10,
  },
  {
    key: 'malformed-response',
    title: 'Malformed provider response',
    description:
      'A response that fails validation is retried once, then falls back.',
    applicationSlug: 'bulk-classifier',
    environment: 'DEVELOPMENT',
    policyName: 'Structured extraction',
    prompt: 'Extract structured fields from this record.',
    structuredOutput: true,
    behaviour: { forceMalformed: true },
    scope: 'first_candidate',
    expect: 'success_with_fallback',
    sortOrder: 11,
  },
  {
    key: 'reliability-first',
    title: 'Reliability-first route',
    description:
      'Selection favours the healthiest target with the strongest recent success rate.',
    applicationSlug: 'support-copilot',
    environment: 'PRODUCTION',
    policyName: 'Reliability first',
    prompt: 'Produce a status update for the customer.',
    expect: 'success',
    sortOrder: 12,
  },
  {
    key: 'priority-route',
    title: 'Priority route',
    description: 'Targets are attempted strictly in their configured order.',
    applicationSlug: 'bulk-classifier',
    environment: 'DEVELOPMENT',
    policyName: 'Lowest cost bulk',
    prompt: 'Route this request using explicit priority ordering.',
    expect: 'success',
    sortOrder: 13,
  },
  {
    key: 'comparison-a',
    title: 'Comparison session, configuration A',
    description:
      'One half of a side-by-side comparison run against the same prompt.',
    applicationSlug: 'support-copilot',
    environment: 'DEVELOPMENT',
    policyName: 'Fastest response',
    prompt: 'Explain our refund policy to a frustrated customer in two sentences.',
    expect: 'success',
    sortOrder: 14,
  },
  {
    key: 'comparison-b',
    title: 'Comparison session, configuration B',
    description:
      'The other half of the comparison, routed by a different policy.',
    applicationSlug: 'support-copilot',
    environment: 'DEVELOPMENT',
    policyName: 'Balanced production',
    prompt: 'Explain our refund policy to a frustrated customer in two sentences.',
    expect: 'success',
    sortOrder: 15,
  },
  {
    key: 'metadata-only-logging',
    title: 'Metadata-only logging',
    description:
      'The workspace default stores no prompt or response body — only counts, timings and cost.',
    applicationSlug: 'bulk-classifier',
    environment: 'PRODUCTION',
    policyName: 'Lowest cost bulk',
    prompt: 'A request whose content is deliberately not persisted.',
    expect: 'success',
    sortOrder: 16,
  },
  {
    key: 'quota-warning',
    title: 'Quota warning threshold',
    description:
      'Consumption crosses the warning threshold; the request is allowed and flagged.',
    applicationSlug: 'bulk-classifier',
    environment: 'PRODUCTION',
    policyName: 'Lowest cost bulk',
    prompt: 'A request that pushes daily consumption past the warning threshold.',
    expect: 'success',
    sortOrder: 17,
  },
];

export function scenarioByKey(key: string): ScenarioDefinition | undefined {
  return DEMO_SCENARIOS.find((scenario) => scenario.key === key);
}
