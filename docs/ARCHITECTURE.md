# Architecture

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

---

## The thesis

Most AI gateways log _which_ model handled a request. OmniRouter persists _why_ — as structured, queryable data attached to the request, including the candidates that were rejected and the reason each one was dropped.

That single decision drives the schema, the API and the interface. A routing decision made last month remains explainable after the policy that produced it has been edited, because the explanation is a stored artefact rather than a runtime log line.

---

## System shape

```mermaid
graph TB
    subgraph Clients
        APP[Customer application]
        DASH[Dashboard user]
    end

    subgraph OmniRouter["OmniRouter AI (Next.js)"]
        API["/api/v1/chat/completions"]
        PG[Playground]
        GW[Gateway: runCompletion]
        RT[Routing engine]
        FB[Fallback executor]
        AD[Provider adapters]
    end

    subgraph Data["PostgreSQL"]
        REQ[(Requests + attempts)]
        CFG[(Policies, models, keys)]
        AGG[(Usage, audit)]
    end

    subgraph Providers
        DEMO[Demo provider<br/>in-process]
        EXT[OpenAI · Anthropic · Gemini<br/>OpenRouter · DeepSeek · Ollama]
    end

    APP -->|virtual API key| API
    DASH -->|session| PG
    API --> GW
    PG --> GW
    GW --> RT
    RT --> FB
    FB --> AD
    AD --> DEMO
    AD --> EXT
    GW --> REQ
    RT -.reads.-> CFG
    GW --> AGG
```

**One execution path.** The public API, the playground and Client Story Mode all call the same `runCompletion`. A demonstration is therefore evidence about production behaviour rather than a parallel mock that can silently drift.

---

## Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API route
    participant G as Gateway
    participant Q as Quota engine
    participant R as Routing engine
    participant F as Fallback executor
    participant P as Provider
    participant D as PostgreSQL

    C->>A: POST /api/v1/chat/completions
    A->>A: Cap body size, validate schema
    A->>D: Resolve key by SHA-256 hash
    D-->>A: workspace, application, environment
    A->>G: runCompletion(scoped input)

    G->>Q: Evaluate quotas for this window
    Q-->>G: allowed / warn / reject
    Note over G,Q: A rejected request never reaches a provider

    G->>R: Evaluate policy against candidates
    R-->>G: selected + ranked chain + explanation

    G->>F: Execute the chain
    F->>P: Attempt 1
    P-->>F: Failure
    F->>F: Classify, apply that category's policy
    F->>P: Attempt 2 (retry or fallback)
    P-->>F: Success
    F-->>G: response + every attempt

    G->>D: Persist request, attempts, explanation, trace
    G->>D: Increment daily usage
    G-->>A: result + correlation id
    A-->>C: 200 + x-omnirouter-correlation-id
```

Steps in order:

1. **Bound** — body size capped before parsing; schema limits message count and total length.
2. **Authenticate** — the presented key is hashed and matched. Workspace, application and environment come from the key, never from the body.
3. **Authorise** — scope and expiry checked before any work.
4. **Meter** — quotas counted for the current window.
5. **Route** — candidates filtered on capability, context and cost, then ranked by strategy.
6. **Execute** — the ranked chain walked; each failure classified before reacting.
7. **Normalise** — provider response mapped into the platform envelope.
8. **Record** — request, attempts, explanation, trace stages and usage persisted.

---

## Routing

```mermaid
flowchart TD
    START[Candidates from policy rules] --> AVAIL{Available?}
    AVAIL -->|no| REJ1[reject: unavailable]
    AVAIL -->|yes| HEALTH{Health = UNAVAILABLE?}
    HEALTH -->|yes| REJ2[reject: unhealthy]
    HEALTH -->|no| CAP{Has required capabilities?}
    CAP -->|no| REJ3[reject: missing_capability]
    CAP -->|yes| CTX{Context window sufficient?}
    CTX -->|no| REJ4[reject: context_too_small]
    CTX -->|yes| COST{Within cost ceiling?}
    COST -->|no| REJ5[reject: exceeds_cost_ceiling]
    COST -->|yes| ELIGIBLE[Eligible]

    ELIGIBLE --> RANK[Rank by strategy]
    RANK --> HEAD[Head = selected]
    RANK --> TAIL[Remainder = fallback chain]
    HEAD --> EXPLAIN[RouteExplanation]
    TAIL --> EXPLAIN
    REJ1 --> EXPLAIN
    REJ2 --> EXPLAIN
    REJ3 --> EXPLAIN
    REJ4 --> EXPLAIN
    REJ5 --> EXPLAIN
```

Filtering is shared by every strategy, so eligibility rules live in one place and no candidate is ever silently dropped. The ordered remainder _is_ the fallback chain — fallback is the same ranking minus the head, not a separate mechanism.

`evaluateRoute` is pure and synchronous: all live signals (health, latency, success rate) are resolved by the caller and passed in, which is what makes all eight strategies unit-testable without a database.

**A degraded provider is deprioritised, not removed.** Only `UNAVAILABLE` filters a candidate out. Health is a decaying signal, not a boolean.

---

## Fallback

```mermaid
flowchart TD
    A[Attempt target] --> R{Succeeded?}
    R -->|yes| DONE[Return, record usage]
    R -->|no| CLASS[Classify failure]
    CLASS --> POL{Policy for this category}
    POL -->|retrySameTarget<br/>and budget left| BACK[Backoff with full jitter] --> A
    POL -->|allowFallback| NEXT{Another candidate?}
    POL -->|neither| STOP[Return classified error]
    NEXT -->|yes| A
    NEXT -->|no| STOP
```

Bounded by **both** `maxAttempts` and `totalTimeoutMs`. Every path either consumes an attempt or exits, so no input can produce an unbounded loop.

| Category               | Retry same | Fallback | Reasoning                                            |
| ---------------------- | ---------- | -------- | ---------------------------------------------------- |
| `AUTHENTICATION`       | no         | yes      | Credentials do not become valid by repetition        |
| `PERMISSION`           | no         | yes      | Retrying cannot grant access                         |
| `RATE_LIMIT`           | 1×         | yes      | Transient; backed-off retry then move on             |
| `TIMEOUT`              | 1×         | yes      | A second retry risks duplicating in-flight work      |
| `PROVIDER_UNAVAILABLE` | no         | yes      | Waiting will not help                                |
| `INVALID_REQUEST`      | no         | **no**   | Fails identically everywhere                         |
| `CONTEXT_LIMIT`        | no         | yes      | Only to a larger window; never truncate silently     |
| `SAFETY_REFUSAL`       | no         | **no**   | Not shopped until a provider complies                |
| `MALFORMED_RESPONSE`   | 1×         | yes      | May parse on retry                                   |
| `NETWORK`              | 1×         | yes      | Transient                                            |
| `QUOTA_EXCEEDED`       | no         | **no**   | A deliberate rejection, not a provider fault         |
| `UNKNOWN`              | no         | yes      | One fallback; never repeat an unrecognised condition |

Backoff uses **full jitter** (`random() × ceiling`) so concurrent requests do not synchronise into a retry storm.

---

## Data model

```mermaid
erDiagram
    Workspace ||--o{ WorkspaceMember : has
    Workspace ||--o{ Application : contains
    Workspace ||--o{ ProviderConnection : configures
    Workspace ||--o{ RoutingPolicy : defines
    Workspace ||--o{ Request : records
    User ||--o{ WorkspaceMember : joins
    User ||--o{ Session : holds
    Application ||--o{ Environment : has
    Application ||--o{ VirtualAPIKey : issues
    Environment ||--o{ VirtualAPIKey : scopes
    ProviderConnection ||--o{ ModelDefinition : exposes
    RoutingPolicy ||--o{ RoutingRule : orders
    ModelDefinition ||--o{ RoutingRule : targeted_by
    Request ||--o{ RequestAttempt : traces
    Request }o--|| RoutingPolicy : routed_by
    Prompt ||--o{ PromptVersion : versions
```

21 entities. Design commitments:

- **Every tenant-scoped table carries `workspaceId`**, so isolation is one indexed predicate rather than a join chain.
- **`Request` → `RequestAttempt`** is the trace. Storing attempts separately is what makes a retry inspectable after the fact.
- **JSONB only where shape must vary** — `routeExplanation`, `traceStages`, policy `requirements` and `scoring`. Everything else is relational and constrained.
- **`UsageDaily` aggregates at the environment grain.** A compound unique containing a nullable column constrains nothing in PostgreSQL, because NULLs compare as distinct — two "no model" rows for the same day would both insert. Per-model analytics derives from `RequestAttempt`, which carries the model on every row.
- **`AuditLog` is append-only by construction.** No update or delete helper exists in the application layer.

---

## Security posture

| Concern              | Approach                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Passwords            | scrypt (`N=16384, r=8, p=1`), per-password salt, parameters embedded so cost can be raised later                       |
| Sessions             | Opaque token in an `httpOnly` cookie; database stores only its SHA-256. Revocable server-side; never in `localStorage` |
| Virtual API keys     | SHA-256 only. Plaintext shown once; the stored prefix cannot authenticate                                              |
| Provider credentials | AES-256-GCM with a random 12-byte IV per encryption. Authenticated: tampering fails to decrypt                         |
| Tenant isolation     | Every query scoped by `workspaceId`. A foreign record is indistinguishable from a missing one                          |
| Authorisation        | Server-side RBAC before every mutation. Hidden buttons are presentation, not access control                            |
| Error messages       | Provider text never forwarded — it can echo prompt content or internal endpoints                                       |
| Content retention    | `METADATA_ONLY` by default; full content requires an explicit workspace opt-in                                         |
| Audit records        | Sensitive keys replaced with `[redacted]` before a snapshot is written                                                 |

Full analysis: [`THREAT_MODEL.md`](THREAT_MODEL.md), [`SECURITY_MODEL.md`](SECURITY_MODEL.md), [`PRIVACY_MODEL.md`](PRIVACY_MODEL.md).

---

## Deployment

```mermaid
graph LR
    DEV[Local: Docker Postgres :5435] --> GH[GitHub]
    GH --> CI[GitHub Actions]
    GH --> VERCEL[Vercel]
    VERCEL --> SUPA[(Supabase PostgreSQL)]
    CI --> PGCI[(Postgres service)]
```

`DATABASE_URL` is the pooled connection used at runtime; `DIRECT_URL` is unpooled and used by Prisma Migrate, because Supabase's pooler cannot run DDL. Every dashboard route is `force-dynamic` — it reads live workspace data and cannot be prerendered.

---

## Stack, and why

| Choice                  | Reason                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 App Router   | Server Components suit a data-heavy dashboard; route groups segment layouts without polluting URLs                        |
| TypeScript **6.0.3**    | Not 7.0.2 (`latest`): `typescript-eslint` declares `<6.1.0`, so TS 7 would disable linting entirely                       |
| ESLint **9.x**          | Not 10.x: `eslint-plugin-react`, pulled in by `eslint-config-next`, calls `context.getFilename()` which ESLint 10 removed |
| Prisma 7 + `pg` adapter | Prisma 7 moves connection URLs to `prisma.config.ts` and connects through a driver adapter rather than the Rust engine    |
| scrypt over argon2      | Ships in the Node standard library — no native compilation in CI or on Vercel's build image                               |
| Tailwind 4              | Token-driven design system in CSS, no config file indirection                                                             |

Recorded in [`DECISIONS.md`](DECISIONS.md).
