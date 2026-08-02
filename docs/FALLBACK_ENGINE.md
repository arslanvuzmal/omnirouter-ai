# Fallback engine

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

---

## Principle

**Classify before reacting.** Uniform retry is not neutral — it is actively harmful:

- Retrying an authentication failure wastes quota and can trigger an account lockout.
- Retrying a validation error can never succeed.
- Retrying a safety refusal against another provider is a safety-control bypass.

Every failure is therefore mapped to one of eleven categories, and each category carries its own policy with a stated rationale.

---

## Guarantees

| Guarantee               | How                                                    |
| ----------------------- | ------------------------------------------------------ |
| **Bounded work**        | Capped by both `maxAttempts` and `totalTimeoutMs`      |
| **No infinite loop**    | Every path either consumes an attempt or exits         |
| **One usage record**    | Only the succeeding attempt contributes tokens or cost |
| **One client response** | The first success returns immediately                  |
| **Complete history**    | Every attempt is recorded, including failures          |
| **Safe errors**         | Provider text never forwarded to a caller              |

---

## Policy table

| Category               | Retry same | Max retries | Fallback | Rationale                                                                                                |
| ---------------------- | ---------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `AUTHENTICATION`       | no         | 0           | yes      | Credentials do not become valid by repetition. The connection is flagged for an administrator.           |
| `PERMISSION`           | no         | 0           | yes      | The credential lacks access to this model; retrying cannot grant it.                                     |
| `RATE_LIMIT`           | yes        | 1           | yes      | Transient. One backed-off retry before moving on.                                                        |
| `TIMEOUT`              | yes        | 1           | yes      | One retry covers transient slowness; a second risks duplicating a request that may already be executing. |
| `PROVIDER_UNAVAILABLE` | no         | 0           | yes      | The provider reported itself unavailable. Fallback is immediate rather than delayed.                     |
| `INVALID_REQUEST`      | no         | 0           | **no**   | The request is malformed. It will fail identically everywhere.                                           |
| `CONTEXT_LIMIT`        | no         | 0           | yes      | Fallback only to a larger context window. Content is never silently truncated.                           |
| `SAFETY_REFUSAL`       | no         | 0           | **no**   | Returned to the caller. Shopping the prompt to another provider until one complies is not a default.     |
| `MALFORMED_RESPONSE`   | yes        | 1           | yes      | May parse on retry; otherwise the next target.                                                           |
| `NETWORK`              | yes        | 1           | yes      | Transient network faults are retried once.                                                               |
| `QUOTA_EXCEEDED`       | no         | 0           | **no**   | A deliberate rejection, not a provider failure.                                                          |
| `UNKNOWN`              | no         | 0           | yes      | One fallback without retry, so an unrecognised condition cannot cause repeated calls.                    |

---

## Backoff

**Full jitter:** `delay = random() × (base × 2^(attempt−1))`

Exponential backoff alone synchronises concurrent retries into a thundering herd — every caller that failed at the same moment retries at the same moment. Multiplying by a uniform random factor spreads them.

A provider-supplied `Retry-After` header always takes precedence over the computed delay, and every delay is clamped to the remaining total-timeout budget.

---

## Classification

**HTTP status** (used by every credential-backed adapter, so classification is consistent across providers):

| Status    | Category               |
| --------- | ---------------------- |
| 401       | `AUTHENTICATION`       |
| 403       | `PERMISSION`           |
| 408       | `TIMEOUT`              |
| 413       | `CONTEXT_LIMIT`        |
| 422       | `INVALID_REQUEST`      |
| 429       | `RATE_LIMIT`           |
| ≥500      | `PROVIDER_UNAVAILABLE` |
| other 4xx | `INVALID_REQUEST`      |

**Thrown values** — abort signals map to `TIMEOUT`; `ECONNREFUSED`, `ENOTFOUND`, socket and `fetch failed` errors map to `NETWORK`; anything else is `UNKNOWN`.

---

## Attempt records

Each attempt persists as a `RequestAttempt` row:

```ts
{
  sequence: 2,
  modelLabel: 'astra-fast',
  providerKind: 'DEMO',
  status: 'TIMED_OUT',
  errorCategory: 'TIMEOUT',
  errorMessage: 'Demo provider did not respond within 1500 ms.',
  latencyMs: 1504,
  inputTokens: 0,          // a failed attempt is never billable
  estimatedCost: 0,
  reason: 'Retry 1 against the same target after a retryable failure.',
}
```

`reason` distinguishes the three ways an attempt can arise — initial selection, same-target retry, or fallback to a different model — which is what makes a three-attempt trace readable at a glance.

---

## Worked example

Primary target times out repeatedly under a `BALANCED` policy with `maxAttempts: 3`:

```
1  astra-fast   TIMED_OUT   1,503 ms   Primary target selected by the routing policy
2  astra-fast   TIMED_OUT   1,504 ms   Retry 1 against the same target after a retryable failure
3  local-ember  SUCCEEDED     841 ms   Fallback target, used after the previous target failed
```

`TIMEOUT` permits one same-target retry, so attempt 2 stays on `astra-fast`. That retry also fails, exhausting the category's allowance, so attempt 3 moves to the next target in the ranked chain — which succeeds. The caller receives a normal response; `fallbackUsed` is `true`, and the correlation id resolves to the full trace.

---

## HTTP mapping

| Category                           | Status  |
| ---------------------------------- | ------- |
| `AUTHENTICATION`                   | 401     |
| `PERMISSION`                       | 403     |
| `INVALID_REQUEST`, `CONTEXT_LIMIT` | 400     |
| `RATE_LIMIT`, `QUOTA_EXCEEDED`     | 429     |
| `TIMEOUT`                          | 504     |
| `PROVIDER_UNAVAILABLE`             | 502     |
| `SAFETY_REFUSAL`                   | **200** |
| other                              | 500     |

`SAFETY_REFUSAL` returns 200 deliberately: the provider answered, and its answer was a refusal. That is a legitimate outcome, not a transport failure, and a client should not retry it as though it were.

---

## Test coverage

12 unit tests over the executor alone, with an injectable clock, sleep and random source so every path is deterministic: first-success short-circuit, immediate fallback, same-target retry then fallback, no-retry categories, terminal categories, attempt ceiling, total-timeout exhaustion, zero cost on failed attempts, sequential numbering, `TIMED_OUT` distinction, and an empty chain.
