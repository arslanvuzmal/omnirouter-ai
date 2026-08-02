# Known limitations

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

A portfolio project that implies more than it implements is worse than one that scopes itself honestly. This is the complete list.

---

## 1. Estimates are estimates

**Token counts are heuristic** unless a provider reports them. The estimator blends a character-based and a word-based approximation; it is not a BPE tokeniser. Shipping a real tokeniser per provider would add tens of megabytes and still be wrong for any model whose vocabulary is undocumented.

When a provider returns authoritative usage, that value always replaces the estimate.

**Cost is derived** from token counts and the pricing a workspace configured on each model. It is a planning signal, never a bill. Real invoices differ through cached-token pricing, batch discounts, negotiated rates and rounding the platform cannot see.

Both are labelled "estimated" everywhere they appear.

---

## 2. Demo models are fictional

Astra Fast, Astra Pro, Nimbus Reasoning and Local Ember do not exist. They run in-process with simulated latency and invented pricing, and are marked _"Demo model — no external provider request"_ in the interface.

They are **not** proxies for, and make no claim about, any real commercial model. Their relative speeds and prices were chosen to make the routing engine's behaviour visible, not to model any real market.

---

## 3. Comparisons are not benchmarks

Comparison mode runs the same prompt through different configurations and shows latency, tokens and cost side by side. Against demo models this measures **simulated** behaviour.

The interface labels it _"Demonstration comparison using configured demo behaviour"_, never a benchmark. Independent model evaluation requires held-out datasets, multiple runs and statistical treatment — none of which this is.

Configurations are executed **sequentially on purpose**: running them concurrently would distort the latency figures the comparison exists to show.

---

## 4. Credential-backed adapters are untested against live endpoints

Six adapters (OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Ollama) are written against each provider's published contract and exercised against recorded response shapes. They have **not** been run against live paid endpoints.

This is a deliberate trade-off: it keeps the project verifiable by anyone without requiring a paid credential. A real deployment should validate each adapter against its provider before relying on it.

The demo provider is fully exercised, including its failure paths.

---

## 5. Security scope

- **No third-party audit or penetration test.** No compliance certification — not SOC 2, ISO 27001, HIPAA or GDPR.
- **`ENCRYPTION_KEY` lives in the environment**, not a managed KMS.
- **No key rotation path.** Rotating `ENCRYPTION_KEY` today would orphan every existing ciphertext; a re-encryption routine is needed first.
- **No CSRF token.** Mutations rely on `sameSite=lax` cookies and server actions — adequate here, but a token is preferable at scale.
- **No distributed rate limiting.** Quotas query the database per request; high throughput needs Redis or equivalent.
- **Audit immutability is by construction, not enforcement.** The application exposes no update or delete path, but direct database access could still modify rows.
- **No content-safety filtering.** Provider refusals are surfaced and respected; the platform performs no classification of its own.

---

## 6. Scale

Designed and tested at demonstration volume.

- **Analytics query raw rows.** `getOverviewMetrics` samples up to 5,000 requests for percentiles. Beyond roughly a million rows per workspace, this needs a rollup table or a columnar store.
- **`UsageDaily` aggregates per environment per day.** Finer granularity requires either more rows or a different aggregation strategy.
- **No caching layer.** Every dashboard view queries the database directly.
- **Quota evaluation runs a count per applicable quota** on every request. Correct, but not free.
- **Connection pooling depends on the deployment.** Serverless requires the pooled `DATABASE_URL`; the unpooled `DIRECT_URL` exists solely for migrations.

---

## 7. Features deliberately not built

Listed as direction, never implied as present:

- Semantic caching
- Streaming through the unified API (the adapters support it; the endpoint does not expose it)
- Organisation SSO (SAML / OIDC)
- Background job queue and webhook delivery
- Image, audio and embedding endpoints
- Evaluation datasets and scored regression runs
- Stripe billing
- Multi-region deployment

---

## 8. Operational

- **No uptime claim.** The status page reports only what it can measure at request time; no independent monitoring is attached.
- **Provider health checks are recorded, not scheduled.** There is no background poller — a real deployment needs one.
- **No alerting.** A degraded provider is visible in the interface but sends no notification.
- **Single-region.** Latency reflects the deployment region.

---

## 9. Interface

- **Policy editing is read-and-preview.** Policies are created through the seed; the interface shows configuration, live signals and a route preview, but does not yet write policy changes.
- **Request pagination is capped** at the most recent 40 rows per filter set.
- **Accessibility is implemented, not certified.** Semantic HTML, visible focus, keyboard navigation, labelled forms, `prefers-reduced-motion` and scrollable wide tables are all present; no formal WCAG audit has been performed.

---

## 10. Testing

**124 tests** cover routing, fallback, cryptography, keys, permissions, redaction, the gateway path, quotas, usage aggregation and tenant isolation.

Not covered:

- **Component-level UI tests.** Rendering is verified by a route check that signs in and visits all 28 routes asserting 2xx and zero console errors, which catches breakage but not visual regression.
- **Load and soak testing.**
- **Chaos testing** beyond the injected provider faults.
- **Cross-browser testing.** Chromium only.
