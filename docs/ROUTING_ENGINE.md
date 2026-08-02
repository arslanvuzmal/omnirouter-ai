# Routing engine

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

---

## Design commitment

A routing decision is a **stored artefact**, not a log line.

`evaluateRoute` is pure and synchronous. Every live signal — health, recent latency, success rate — is resolved by the caller and passed in. That is what allows all eight strategies to be unit-tested without a database, and it means the route preview in the interface and the request path cannot diverge: both call the same function.

---

## Pipeline

```
filter → strategy-specific ordering → head = selected → remainder = fallback chain → explain
```

Filtering is shared by every strategy, so eligibility rules live in one place. **No candidate is ever silently dropped** — each rejection is recorded with a machine-readable reason and a human-readable detail.

The ordered remainder _is_ the fallback chain. Fallback is the same ranking minus the head, not a separate mechanism with its own rules.

---

## Filtering

Applied in order; the first failure ends evaluation for that candidate.

| Check                         | Rejection reason       | Detail recorded                               |
| ----------------------------- | ---------------------- | --------------------------------------------- |
| `isAvailable`                 | `unavailable`          | Marked unavailable in the workspace catalogue |
| `healthState === UNAVAILABLE` | `unhealthy`            | Most recent health check reported unavailable |
| Provider excluded by policy   | `provider_excluded`    | Provider is excluded by this policy           |
| Required capabilities present | `missing_capability`   | Names the specific missing capability         |
| `contextWindow ≥ required`    | `context_too_small`    | States both figures                           |
| `projectedCost ≤ ceiling`     | `exceeds_cost_ceiling` | States both figures                           |

**A `DEGRADED` provider stays eligible.** Only `UNAVAILABLE` filters a candidate out. Health is a decaying signal, not a boolean — a degraded target is deprioritised by reliability-aware scoring rather than removed, because removing it could leave a request with nowhere to go during a partial outage.

---

## Strategies

### `MANUAL`

Uses the model named in the request. No scoring, and **no fallback chain** — substituting a different model would defeat the purpose of pinning one.

### `PRIORITY`

Lowest priority number first; ties broken by label for determinism.

### `WEIGHTED`

Weighted random selection **without replacement**: the head is drawn by weight, then the process repeats over the remainder, so the fallback chain is itself weight-ordered rather than arbitrary.

If every remaining weight is zero, the engine falls back to deterministic priority order rather than dividing by zero.

The random source is injectable, which is what makes the strategy testable.

### `LOWEST_ESTIMATED_COST`

Lowest projected cost among candidates meeting the requirements. Cost is projected from estimated input tokens, requested output tokens and the pricing configured on that model.

### `LOWEST_RECENT_LATENCY`

Lowest mean latency across recent successful attempts.

**A model with no samples ranks _after_ one with evidence.** Treating "no measurement" as zero latency would make every newly added model win permanently.

### `RELIABILITY_FIRST`

Health first, then recent success rate, then priority.

### `CAPABILITY_MATCH`

Filters to candidates satisfying every required capability, then prefers the largest context window.

### `BALANCED`

Scores five factors, each normalised to `[0,1]` where higher is better, multiplied by a configured weight:

| Factor        | Source                     | Normalisation                                                    |
| ------------- | -------------------------- | ---------------------------------------------------------------- |
| `health`      | Health state               | `HEALTHY 1.0` · `UNKNOWN 0.6` · `DEGRADED 0.3` · `UNAVAILABLE 0` |
| `successRate` | Recent attempts            | Rate directly; **0.5 when no samples**                           |
| `latency`     | Recent successful attempts | Inverted min–max across candidates                               |
| `cost`        | Projected cost             | Inverted min–max across candidates                               |
| `preference`  | Configured priority        | Inverted min–max across candidates                               |

Default weights: health `0.25`, successRate `0.25`, latency `0.20`, cost `0.20`, preference `0.10`. Overridable per policy.

Two deliberate choices:

- **No samples scores 0.5**, not 0 or 1 — a new model is neither rewarded nor punished for having no history.
- **Latency and cost are normalised across the candidate set**, not against absolute thresholds, so the score adapts to whatever models a workspace actually has.

Every factor's raw value, normalised value, weight and contribution is retained, so the interface can show exactly why one candidate outranked another.

---

## The explanation

Persisted to `Request.routeExplanation` as JSONB:

```ts
interface RouteExplanation {
  policyId: string | null;
  policyName: string;
  strategy: RoutingStrategy;
  candidates: Array<{
    modelLabel;
    providerKind;
    priority;
    weight;
    projectedCost;
    recentLatencyMs;
    recentSuccessRate;
    healthState;
  }>;
  rejectedCandidates: Array<{ modelLabel; reason; detail }>;
  selectedCandidate: { modelLabel; providerKind } | null;
  reason: string;
  scoreBreakdown: Array<{ modelLabel; score; components }>;
  fallbackOrder: string[];
  evaluatedAt: string;
}
```

**Every candidate is accounted for** — selected, rejected during filtering, or eligible-but-outranked (`not_selected`, retained for fallback).

`fallbackOrder` stores **model labels, not internal ids**. This was a defect found by reading the rendered trace: ids are meaningless to the person the screen exists for.

---

## Honest wording

The engine never claims to have found the best model. Generated reasons read:

> "Astra Fast scored highest against the configured scoring policy. 3 candidates were eligible."

and the interface adds:

> "Selected according to the configured scoring policy. These weights express a workspace preference; they do not identify an objectively best model."

A unit test asserts the phrase "best model" never appears in a generated reason.

---

## When nothing is eligible

The explanation summarises _why_, grouped by reason:

> "No eligible target remained after filtering 3 candidates (2 × missing capability, 1 × context too small)."

An empty policy states that plainly rather than reporting a mysterious failure.

---

## Test coverage

20 unit tests: each filtering rule, each strategy's ordering, weighted determinism under a seeded random source, score bounds (no contribution can exceed its weight), full candidate accounting, label-based fallback order, and the wording constraint.
