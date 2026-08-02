# Decisions

**Project:** OmniRouter AI
**Author:** Arslan Vuzmal Lone

Each entry records what was chosen, what it was chosen over, and why.

---

## 1. The routing decision is stored, not logged

**Chosen:** Persist a structured `RouteExplanation` on every request, including rejected candidates and a per-factor score breakdown.

**Over:** Logging the selected model, as most gateways do.

**Why:** A log line answers "what happened" only while the log is retained and only if someone was watching. A stored explanation answers "why" indefinitely, and survives the policy that produced it. When an operator asks six weeks later why a request cost more than expected, the answer is a database row, not an archaeology exercise.

**Cost:** JSONB per request. Acceptable — the explanation is small and the alternative is being unable to answer the question at all.

---

## 2. One execution path

**Chosen:** The public API, the playground and Client Story Mode all call the same `runCompletion`.

**Over:** A separate, simpler path for the playground and demo.

**Why:** A demonstration that runs different code proves nothing about production. Sharing the path means the demo cannot silently drift, and every bug the demo surfaces is a real bug.

**Cost:** The playground carries the full lifecycle including quota checks. That is a feature, not overhead — it makes quota behaviour demonstrable.

---

## 3. Failures are classified before they are retried

**Chosen:** An eleven-category taxonomy, each with its own retry and fallback policy.

**Over:** A uniform "retry N times then fail".

**Why:** Uniform retry is actively harmful. Retrying an authentication failure wastes quota and can trigger a lockout. Retrying a validation error can never succeed. Retrying a safety refusal against another provider is a safety-control bypass.

**Cost:** More code and a decision to make per category. The rationale is stored alongside each policy and surfaced in the interface, so the reasoning is inspectable rather than folded into a constant.

---

## 4. `SAFETY_REFUSAL` blocks fallback by default

**Chosen:** A refusal is returned to the caller. It is never retried against another provider.

**Over:** Treating a refusal as a failure worth routing around.

**Why:** A gateway that automatically shops a refused prompt until some provider complies is a mechanism for laundering safety controls. That is a product decision, and the honest default is to respect the refusal.

**Escape hatch:** A policy could define a legitimate permitted fallback, but nothing does so by default and nothing does so implicitly.

---

## 5. Database-backed sessions

**Chosen:** An opaque token in an `httpOnly` cookie, stored server-side as SHA-256.

**Over:** A self-contained JWT.

**Why:** Revocation. A JWT is valid until it expires; a database session can be killed instantly, which matters after a password change or a suspected compromise. Storing only the hash means a database disclosure yields no usable session. Nothing in `localStorage`, so an XSS cannot read the token.

**Cost:** A database read per request. Mitigated by refreshing `lastSeenAt` at most once a day rather than on every request.

---

## 6. scrypt over argon2

**Chosen:** scrypt from the Node standard library.

**Over:** argon2, generally considered stronger.

**Why:** argon2 requires native compilation, which means a build toolchain in CI and on Vercel's build image, and a class of deployment failure that has nothing to do with the application. scrypt is memory-hard, well understood, and needs no build step. Cost parameters are embedded in the stored hash so they can be raised without invalidating existing passwords.

**Trade-off:** Acknowledged — argon2id is the stronger primitive. scrypt at `N=16384` is a defensible choice for this threat model.

---

## 7. `UsageDaily` aggregates at the environment grain

**Chosen:** One rollup row per workspace, application, environment and day. Per-model analytics derives from `RequestAttempt`.

**Over:** Including `modelId` in the rollup's compound unique.

**Why:** A compound unique containing a nullable column does not constrain anything in PostgreSQL — NULLs compare as distinct, so two "no model" rows for the same day would both insert and the aggregate would silently drift. This was caught by a type error and corrected before any data existed.

`RequestAttempt` already carries the model on every row and is indexed for it, so nothing is lost.

---

## 8. TypeScript 6.0.3, not 7.0.2

**Chosen:** TypeScript 6.0.3.

**Over:** 7.0.2, which is `latest` on npm.

**Why:** `typescript-eslint@8.65` declares a peer range of `>=4.8.4 <6.1.0`. Installing TS 7 would leave linting either broken or silently skipped. A type checker one major version behind is a smaller cost than no lint rules at all.

**Revisit when:** `typescript-eslint` supports TS 7.

---

## 9. ESLint 9, not 10

**Chosen:** ESLint 9.39.5.

**Over:** 10.8.0, initially installed.

**Why:** ESLint 10 removed `context.getFilename()`. `eslint-plugin-react`, pulled in transitively by `eslint-config-next`, still calls it, so every lint run crashed on the first JSX file. Not a configuration problem — the plugin is incompatible.

`FlatCompat` was also removed: `eslint-config-next` 16 ships native flat configs, and the compatibility shim could not serialise Next's plugin graph without hitting a circular reference.

---

## 10. Fault injection is scoped

**Chosen:** Three scopes — `all`, `first_attempt`, `first_candidate`.

**Over:** A single boolean "inject a failure".

**Why:** With a first-attempt-only fault, `TIMEOUT` recovers on its _same-target retry_, so the demonstration shows a retry rather than a fallback — technically correct, but not the story the feature exists to tell. Scoping the fault to the whole primary candidate exhausts its retries and forces a genuine move to a different model.

This was found by reading the seeded output rather than assuming it worked.

---

## 11. Metadata-only logging by default

**Chosen:** No prompt or response bodies are stored unless a workspace explicitly opts in.

**Over:** Storing content by default for a better debugging experience.

**Why:** The default should be the one that retains the least personal data. A customer's prompts may contain their own users' data, and a platform that silently retains it creates an obligation nobody agreed to.

**Cost:** Debugging is harder by default. `REDACTED` mode exists as a middle ground.

---

## 12. Estimates are labelled as estimates

**Chosen:** Token counts and costs are presented as estimates, everywhere, with the derivation stated.

**Over:** Presenting them as authoritative figures.

**Why:** They are estimates. Token counts are heuristic unless a provider reports them, and cost derives from workspace-configured pricing that may not match a real invoice. A dashboard that presents an estimate as a bill will eventually be believed, and will eventually be wrong in a way that matters.

---

## 13. Weighted selection orders the whole chain

**Chosen:** Weighted random _without replacement_ — draw the head by weight, then repeat over the remainder.

**Over:** Drawing only the head and ordering the rest arbitrarily.

**Why:** If weights express a preference, they should express it for the fallback too. A request that falls back should land on the next most preferred target, not an arbitrary one.

---

## 14. A model with no latency samples ranks last

**Chosen:** `null` recent latency sorts after any measured value.

**Over:** Treating no measurement as zero.

**Why:** Zero would make every newly added model appear infinitely fast and win permanently — a bug that would look like a feature until someone noticed all traffic had silently moved.

In `BALANCED` scoring, a missing success rate scores `0.5`: neither rewarded nor punished for having no history.

---

## 15. Degraded providers stay eligible

**Chosen:** Only `UNAVAILABLE` filters a candidate out.

**Over:** Removing anything not `HEALTHY`.

**Why:** Health is a decaying signal, not a boolean. During a partial outage, removing every degraded provider could leave a request with nowhere to go. Deprioritising is the safer behaviour: reliability-aware strategies rank them lower, but they remain available as a last resort.
