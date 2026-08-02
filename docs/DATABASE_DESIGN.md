# Database design

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

PostgreSQL 16, 21 entities, accessed through Prisma 7 with the `pg` driver adapter.

---

## Principles

1. **Every tenant-scoped table carries `workspaceId`.** Isolation becomes one indexed predicate rather than a join chain, and a query that forgets it is visibly wrong.
2. **Relational by default, JSONB by exception.** JSONB is used only where the shape must vary without a migration: `routeExplanation`, `traceStages`, policy `requirements` and `scoring`, and demo scenario `behaviour`.
3. **Secrets are never columns of plaintext.** Credentials are ciphertext, keys and tokens are hashes.
4. **Soft archive where history matters** (`archivedAt` on applications and prompts), hard cascade where it does not.

---

## Entities

### Identity

**`User`** — email (unique), name, scrypt `passwordHash`, `status`, `isDemoAccount`, `failedLogins`, `lockedUntil`, `lastLoginAt`.
Throttling counters live on the row so a limit survives a restart and cannot be evaded by rotating IPs.

**`Session`** — `tokenHash` (unique, SHA-256), `userId`, `expiresAt`, `ipHash`, `userAgent`, `lastSeenAt`.
The raw token exists only in the cookie. Indexed on `userId` and `expiresAt`.

### Tenancy

**`Workspace`** — name, slug (unique), `contentLoggingMode`, `isDemoWorkspace`, `isProtected`, `archivedAt`.
`isProtected` guards destructive operations on shared demonstration data.

**`WorkspaceMember`** — unique on `(workspaceId, userId)`; indexed on `(workspaceId, role)`.

**`Invitation`** — `tokenHash` (unique), unique on `(workspaceId, email, status)` so one pending invitation exists per address.

### Applications

**`Application`** — unique on `(workspaceId, slug)`; indexed on `(workspaceId, archivedAt)`.

**`Environment`** — unique on `(applicationId, type)`, so exactly one development and one production environment exist per application. `defaultPolicyId` is `SetNull` on delete: removing a policy must not remove the environment.

### Providers

**`ProviderConnection`** — `kind`, `label`, `credentialCiphertext` (nullable — demo and Ollama need none), `baseUrl`, `status`, `healthState`. Unique on `(workspaceId, kind, label)`.

**`ModelDefinition`** — `modelId`, `displayName`, `contextWindow`, four capability booleans, `inputPricePerMillion` and `outputPricePerMillion` as `Decimal(12,4)`, `isAvailable`, `healthState`. Unique on `(connectionId, modelId)`.

Pricing is `Decimal`, not float: money-shaped values should not accumulate binary rounding error.

**`ProviderHealthCheck`** — append-only history, indexed on `(connectionId, checkedAt)`.

### Routing

**`RoutingPolicy`** — `strategy`, `status`, `version`, `maxAttempts`, `attemptTimeoutMs`, `totalTimeoutMs`, `maxEstimatedCost`, plus JSONB `requirements` and `scoring`. Unique on `(workspaceId, name)`.

**`RoutingRule`** — joins a policy to a model with `priority` and `weight`. Unique on `(policyId, modelId)`; indexed on `(policyId, priority)`.

### Keys

**`VirtualAPIKey`** — `keyPrefix` (display only), `keyHash` (unique, SHA-256), `scopes`, `status`, `expiresAt`, `lastUsedAt`, `revokedAt`. Scoped to both an application and an environment.

### Prompts

**`Prompt`** — unique on `(workspaceId, name)`, with `activeVersionId` as a unique nullable pointer.
**`PromptVersion`** — unique on `(promptId, version)`; immutable once written. Rolling back moves the pointer rather than editing history.

### Requests

**`Request`** — the trace root.

| Column                                          | Purpose                                                 |
| ----------------------------------------------- | ------------------------------------------------------- |
| `correlationId`                                 | Unique; returned to the client and in a header          |
| `idempotencyKey`                                | Unique **per workspace**; enforces at-most-once         |
| `status`, `errorCategory`, `errorMessage`       | Outcome                                                 |
| `resolvedModel`, `fallbackUsed`, `attemptCount` | Summary                                                 |
| `inputTokens`, `outputTokens`, `totalTokens`    | Usage                                                   |
| `estimatedCost` `Decimal(12,6)`                 | Sub-cent precision                                      |
| `routeExplanation` JSONB                        | Why this route was chosen                               |
| `traceStages` JSONB                             | Ordered lifecycle stages                                |
| `promptPreview`, `responsePreview`              | **Null unless the workspace opts out of metadata-only** |

Indexes: `(workspaceId, createdAt)`, `(applicationId, createdAt)`, `(workspaceId, status, createdAt)`, `(workspaceId, errorCategory)`, `(environmentId, createdAt)` — matching the explorer's filter combinations.

**`RequestAttempt`** — one row per provider attempt. Unique on `(requestId, sequence)`. Carries its own tokens, cost, latency, error category and a `reason` distinguishing initial selection from retry from fallback.

Storing attempts separately is what makes a retry inspectable after the fact.

### Aggregates and governance

**`UsageDaily`** — unique on `(workspaceId, applicationId, environmentId, day)`.

`modelId` is deliberately **absent**. A compound unique containing a nullable column constrains nothing in PostgreSQL, because NULLs compare as distinct — two "no model" rows for the same day would both insert and the aggregate would silently drift. Per-model analytics derives from `RequestAttempt`, which carries the model on every row and is already indexed for it.

**`Quota`** — `window`, nullable `maxRequests`/`maxTokens`/`maxCost` (null means unlimited on that dimension), `warnThreshold`, `action`. Nullable `applicationId`/`environmentId` mean workspace-wide.

**`AuditLog`** — actor, action, resource, `previousState`/`newState` JSONB (redacted before write), `correlationId`, `ipHash`. Append-only: the application layer has no update or delete path.

**`DemoScenario`** — unique on `(workspaceId, key)`.

---

## Cascade behaviour

| Relationship                               | On delete | Reasoning                                         |
| ------------------------------------------ | --------- | ------------------------------------------------- |
| Workspace → everything                     | `Cascade` | Deleting a workspace must leave no orphans        |
| User → sessions, memberships               | `Cascade` |                                                   |
| Application → environments, keys, requests | `Cascade` |                                                   |
| Environment → default policy               | `SetNull` | Removing a policy must not remove the environment |
| Request → attempts                         | `Cascade` | Attempts have no meaning alone                    |
| Attempt → model                            | `SetNull` | A trace must survive a model being decatalogued   |
| AuditLog → actor                           | `SetNull` | The record outlives the account                   |

That `SetNull` on attempt → model matters: a trace from six months ago must remain readable after the model it used has been removed from the catalogue.

---

## Migrations

One migration, `20260731180000_init_omnirouter_schema`, 686 lines.

The `UsageDaily` grain correction was folded into it rather than stacked as a fix-up, because nothing had shipped and the database held no data — a clean initial migration is worth more than a record of a mistake corrected before anyone saw it. That decision is recorded here and in `DECISIONS.md` rather than hidden.
