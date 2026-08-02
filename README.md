<div align="center">

```
    ╭─────╮
────┤     ├────●
────┤  ◉  │
────┤     │
    ╰─────╯
```

# OmniRouter AI

**One secure control plane for your AI models, applications, routing policies, usage and failures.**

[![Tests](https://img.shields.io/badge/tests-124%20passing-34d399?style=flat-square)](#testing)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-38cee8?style=flat-square)](#technology)
[![Next.js](https://img.shields.io/badge/Next.js-16-f5f8fc?style=flat-square)](#technology)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-38cee8?style=flat-square)](#technology)
[![Licence](https://img.shields.io/badge/licence-MIT-8b98ab?style=flat-square)](LICENSE)

</div>

---

![OmniRouter dashboard](portfolio/screenshots/02-overview-dashboard.png)

## Live demo

> **Demo:** _deployment link added once verified live_
> **Guided walkthrough:** `/demo/story` — six steps, about a minute
>
> **Sign in with any role:**
>
> | Email                       | Role      | Sees                                  |
> | --------------------------- | --------- | ------------------------------------- |
> | `owner@omnirouter.demo`     | Owner     | Everything                            |
> | `admin@omnirouter.demo`     | Admin     | Everything except workspace deletion  |
> | `developer@omnirouter.demo` | Developer | Playground, prompts, development keys |
> | `viewer@omnirouter.demo`    | Viewer    | Read-only — try running a request     |
>
> **Password:** `OmniDemo!2026`
>
> The demonstration runs entirely on a deterministic in-process provider. **No external API key is required, and no request leaves the deployment.** The demo workspace is protected: destructive operations are refused server-side.

---

## The problem

A team ships an AI feature against one provider. It works.

Then the provider rate-limits at peak. Or returns a 500 during a customer demo. Or triples in price. Or a better-suited model appears.

By then the provider call is spread across a dozen files, nobody can say what a given request actually cost, and adding a second provider means touching every one of them.

## What OmniRouter changes

- Your application calls **one endpoint** and never learns which provider served it.
- Routing is a **policy an operator edits in the interface**, not a branch in application code.
- A provider failure triggers a **classified, bounded fallback** instead of an exception.
- Every request leaves a **trace** explaining the decision, the attempts and the cost.
- Credentials live **encrypted in one place**, behind virtual keys you can revoke instantly.

---

## What makes it different

Most gateways log _which_ model handled a request. OmniRouter persists **why** — as structured data attached to the request, including the candidates that were rejected and the reason each was dropped.

```json
{
  "strategy": "BALANCED",
  "selectedCandidate": { "modelLabel": "astra-fast", "providerKind": "DEMO" },
  "reason": "Astra Fast scored highest against the configured scoring policy. 3 candidates were eligible.",
  "scoreBreakdown": [
    {
      "modelLabel": "astra-fast",
      "score": 0.992,
      "components": [
        { "factor": "health", "normalised": 1.0, "weight": 0.25, "contribution": 0.25 },
        {
          "factor": "successRate",
          "normalised": 1.0,
          "weight": 0.25,
          "contribution": 0.25
        },
        { "factor": "latency", "normalised": 1.0, "weight": 0.2, "contribution": 0.2 },
        { "factor": "cost", "normalised": 0.96, "weight": 0.2, "contribution": 0.192 },
        { "factor": "preference", "normalised": 1.0, "weight": 0.1, "contribution": 0.1 }
      ]
    }
  ],
  "rejectedCandidates": [
    {
      "modelLabel": "nimbus-reasoning",
      "reason": "missing_capability",
      "detail": "Does not support required capability: vision."
    }
  ],
  "fallbackOrder": ["local-ember", "astra-pro"]
}
```

That record **survives the policy that produced it**, so a decision made last month is still explainable after the policy has been edited.

---

## The failure story

The screen this project exists for. A request where the primary provider stalled:

![Fallback trace](portfolio/screenshots/07-fallback-trace.png)

```
Attempt 1   astra-fast     TIMED OUT    1,503 ms   Primary target selected by the routing policy
Attempt 2   astra-fast     TIMED OUT    1,504 ms   Retry 1 against the same target after a retryable failure
Attempt 3   local-ember    SUCCEEDED      841 ms   Fallback target, used after the previous target failed
```

The caller received a normal response. An operator can see every attempt it took.

**Failures are classified before anything is retried** — because retrying an authentication error wastes quota and can lock an account, while retrying a validation error can never succeed:

| Category               | Retry same target | Fallback | Reasoning                                       |
| ---------------------- | ----------------- | -------- | ----------------------------------------------- |
| `AUTHENTICATION`       | no                | yes      | Credentials do not become valid by repetition   |
| `RATE_LIMIT`           | 1×                | yes      | Transient; backed-off retry, then move on       |
| `TIMEOUT`              | 1×                | yes      | A second retry risks duplicating in-flight work |
| `PROVIDER_UNAVAILABLE` | no                | yes      | Waiting will not help                           |
| `INVALID_REQUEST`      | no                | **no**   | Fails identically everywhere                    |
| `SAFETY_REFUSAL`       | no                | **no**   | Not shopped until a provider complies           |
| `QUOTA_EXCEEDED`       | no                | **no**   | A deliberate rejection, not a provider fault    |

That `SAFETY_REFUSAL` row is a deliberate design decision. A gateway that automatically routes around refusals is a safety-control bypass, so this one does not.

---

## Features

| Module                          | What it does                                                             |
| ------------------------------- | ------------------------------------------------------------------------ |
| **Applications & environments** | Isolated consumers with separate development and production environments |
| **Provider connections**        | 7 adapters; credentials encrypted with AES-256-GCM                       |
| **Model catalogue**             | Context window, capabilities, pricing, availability, health              |
| **Routing policies**            | 8 strategies, each producing a stored explanation                        |
| **Unified API**                 | OpenAI-compatible endpoint with namespaced routing metadata              |
| **Playground**                  | Runs the real gateway; injects failures to watch fallback react          |
| **Comparison mode**             | Same prompt, two policies, side by side                                  |
| **Request traces**              | Lifecycle stages and every attempt, including failures                   |
| **Analytics**                   | Success rate, fallback rate, P50/P95 latency, tokens, cost               |
| **Virtual API keys**            | Hashed, scoped, expiring, instantly revocable                            |
| **Prompt registry**             | Immutable versions with a moving active pointer                          |
| **Quotas**                      | Per-minute, day and month caps on requests, tokens or cost               |
| **Audit log**                   | Append-only, with sensitive values redacted                              |
| **Team & roles**                | Five roles enforced server-side                                          |

### Routing strategies

`MANUAL` · `PRIORITY` · `WEIGHTED` · `LOWEST_ESTIMATED_COST` · `LOWEST_RECENT_LATENCY` · `RELIABILITY_FIRST` · `CAPABILITY_MATCH` · `BALANCED`

None claims to find the objectively best model. Each expresses a **configured preference**, and says so in its explanation.

---

## Screenshots

|                                                                                                                      |                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ![Playground](portfolio/screenshots/05-playground.png) **Playground** — run requests, simulate failures              | ![Analytics](portfolio/screenshots/09-usage-analytics.png) **Analytics** — computed from real rows                      |
| ![Routing](portfolio/screenshots/03-routing-policy-builder.png) **Routing policies** — strategies and fallback order | ![Requests](portfolio/screenshots/08-request-inspector.png) **Request explorer** — filter by status, category, fallback |

---

## Architecture

```mermaid
graph LR
    APP[Your application] -->|one endpoint| GW[Gateway]
    GW --> Q[Quotas]
    Q --> R[Routing engine]
    R --> F[Fallback executor]
    F --> P[Provider adapters]
    GW --> DB[(PostgreSQL)]
```

**One execution path.** The public API, the playground and the guided demo all call the same `runCompletion`, so a demonstration is evidence about production behaviour rather than a mock that can drift.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Technology

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Server Components)          |
| Language   | TypeScript 6, strict, `noUncheckedIndexedAccess`    |
| UI         | React 19, Tailwind CSS 4, Recharts, Lucide          |
| Database   | PostgreSQL 16, Prisma 7 via the `pg` driver adapter |
| Validation | Zod on every external input                         |
| Testing    | Vitest, Playwright                                  |
| Deployment | Vercel + Supabase                                   |

Two version choices are deliberate and would otherwise look like oversights:

- **TypeScript is pinned to 6.0.3**, not the 7.0.2 `latest` — `typescript-eslint` declares a peer range of `<6.1.0`, so adopting TS 7 would silently disable linting.
- **ESLint is pinned to 9.x**, not 10.x — `eslint-plugin-react`, pulled in by `eslint-config-next`, calls `context.getFilename()`, which ESLint 10 removed. Linting cannot run at all on 10.

---

## Local setup

```bash
git clone https://github.com/arslanvuzmal/omnirouter-ai.git
cd omnirouter-ai
npm install

cp .env.example .env.local
# Generate the three secrets:
#   openssl rand -base64 32   → AUTH_SECRET
#   openssl rand -base64 32   → ENCRYPTION_KEY   (must decode to exactly 32 bytes)
#   openssl rand -base64 32   → INTERNAL_API_SECRET

npm run db:up          # PostgreSQL 16 on port 5435
npm run db:deploy      # apply migrations
npx tsx prisma/seed/index.ts   # seed the demo workspace
npm run dev
```

Open <http://localhost:3000> and sign in as `owner@omnirouter.demo`.

### Environment variables

| Variable                  | Required | Purpose                                                |
| ------------------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL`            | yes      | Pooled connection used at runtime                      |
| `DIRECT_URL`              | yes      | Unpooled connection for migrations                     |
| `AUTH_SECRET`             | yes      | Signs session cookies (≥32 chars)                      |
| `ENCRYPTION_KEY`          | yes      | AES-256-GCM key (**exactly** 32 bytes, base64)         |
| `INTERNAL_API_SECRET`     | no       | Guards internal maintenance endpoints                  |
| `APP_URL`                 | no       | Defaults to `http://localhost:3000`                    |
| `DEMO_MODE`               | no       | Enables the demo provider and accounts                 |
| `OPENAI_API_KEY` _et al._ | no       | Optional; the platform is fully functional without any |

---

## API usage

```bash
curl -X POST https://your-deployment/api/v1/chat/completions \
  -H "Authorization: Bearer omr_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "system", "content": "You are a support assistant." },
      { "role": "user", "content": "Draft a reply to this complaint." }
    ],
    "max_tokens": 400,
    "policy": "Balanced production"
  }'
```

The response is OpenAI-shaped, so an existing client works with only a base-URL change. Routing metadata arrives under a namespaced field that OpenAI-shaped clients ignore:

```json
{
  "id": "ed190580-fd01-44a3-9e46-eb20fe7f435e",
  "object": "chat.completion",
  "model": "astra-fast",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "…" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 10, "completion_tokens": 63, "total_tokens": 73 },
  "omnirouter": {
    "correlation_id": "ed190580-…",
    "provider": "DEMO",
    "fallback_used": false,
    "attempts": 1,
    "estimated_cost": 0.000039,
    "latency_ms": 540,
    "strategy": "BALANCED",
    "routing_reason": "Astra Fast scored highest against the configured scoring policy."
  }
}
```

Send an `Idempotency-Key` header for at-most-once execution per workspace. Full reference: [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md).

---

## Testing

```bash
npm run verify            # format, lint, typecheck, unit tests, production build
npm run test              # 87 unit tests
npm run test:integration  # 14 integration tests (needs the database)
npm run test:security     # 23 security tests (needs the database)
npm run demo:verify       # 18 assertions about the seeded demonstration
```

**124 tests.** Integration and security tests run against a real PostgreSQL database with per-run namespaced fixtures, so a test run cannot disturb seeded data sharing the same instance.

The security suite asserts properties that must hold against an active attacker: a request in another workspace is indistinguishable from one that does not exist; an unknown key and a malformed key return byte-identical rejections; credentials are unrecoverable from the database; and routing instructions embedded in prompt content are ignored.

---

## Security

- Passwords: scrypt with per-password salt and embedded cost parameters
- Sessions: database-backed, SHA-256 stored, `httpOnly` cookie, nothing in `localStorage`
- API keys: SHA-256 only; plaintext shown once and unrecoverable
- Credentials: AES-256-GCM with a random IV per encryption
- Isolation: every query scoped by workspace
- Logging: metadata only by default — no prompt or response bodies

Full analysis: [`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) · [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) · [`SECURITY.md`](SECURITY.md)

---

## Known limitations

Stated plainly, because a portfolio project that implies more than it implements is worse than one that scopes itself honestly.

- **No third-party audit or penetration test**, and no compliance certification.
- **Token counts are heuristic** unless a provider reports them; **cost is an estimate** from workspace-configured pricing, never a bill.
- **Demo models are fictional.** Astra Fast, Astra Pro, Nimbus Reasoning and Local Ember run in-process with simulated latency and invented pricing. They are not proxies for any real model.
- **Comparisons are demonstrations, not benchmarks.**
- **`ENCRYPTION_KEY` has no rotation path** — rotating it today would orphan existing ciphertext.
- **No distributed rate limiting.** Quotas hit the database per request; high throughput needs Redis.
- **Credential-backed adapters are written against published contracts** and tested against recorded response shapes, not live paid endpoints.
- **The status page claims no uptime figure**; it reports only what it can measure at request time.

Full list: [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)

---

## Roadmap

Not built. Listed as direction, not as an implied feature.

- Semantic caching with cost-saving measurement
- Streaming through the unified API surface
- Organisation SSO (SAML / OIDC)
- Redis-backed distributed rate limiting
- Webhook delivery with signed payloads and retry
- Evaluation datasets and scored regression runs

---

## Documentation

| Document                                            | Covers                               |
| --------------------------------------------------- | ------------------------------------ |
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | System shape, lifecycle, data model  |
| [`DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md)     | 21 entities, indexes, constraints    |
| [`PROVIDER_ADAPTERS.md`](docs/PROVIDER_ADAPTERS.md) | The adapter contract                 |
| [`ROUTING_ENGINE.md`](docs/ROUTING_ENGINE.md)       | Eight strategies, scoring            |
| [`FALLBACK_ENGINE.md`](docs/FALLBACK_ENGINE.md)     | Classification and retry policy      |
| [`API_REFERENCE.md`](docs/API_REFERENCE.md)         | Endpoint, headers, errors            |
| [`SECURITY_MODEL.md`](docs/SECURITY_MODEL.md)       | Controls, and what is not claimed    |
| [`THREAT_MODEL.md`](docs/THREAT_MODEL.md)           | Threats, mitigations, accepted risks |
| [`PRIVACY_MODEL.md`](docs/PRIVACY_MODEL.md)         | Retention and redaction              |
| [`TEST_PLAN.md`](docs/TEST_PLAN.md)                 | Coverage and rationale               |
| [`DEPLOYMENT.md`](docs/DEPLOYMENT.md)               | Vercel and Supabase                  |
| [`DECISIONS.md`](docs/DECISIONS.md)                 | Choices and their reasoning          |
| [`RESEARCH_NOTES.md`](docs/RESEARCH_NOTES.md)       | Prior art reviewed, and originality  |
| [`KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) | Honest boundaries                    |

---

## Licence

MIT — see [`LICENSE`](LICENSE).

## Project owner

**Arslan Vuzmal Lone**
