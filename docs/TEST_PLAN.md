# Test plan

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

**124 tests:** 87 unit, 14 integration, 23 security.

## Structure

| Project       | Database | Runs           | Purpose                                |
| ------------- | -------- | -------------- | -------------------------------------- |
| `unit`        | no       | Every save     | Pure logic, fast enough to be habitual |
| `integration` | yes      | Pre-commit, CI | Persistence and the real gateway path  |
| `security`    | yes      | Pre-commit, CI | Isolation and authorisation properties |

Integration and security run **single-threaded**: they share one database, and parallel runs would interfere with each other's row counts. Fixtures are namespaced with a per-run prefix (`test-<pid>-<timestamp>`) and removed in `afterAll`, so a test run never disturbs seeded demonstration data in the same instance.

## Unit — 87

**Routing (20).** Every filtering rule with its recorded rejection reason; all eight strategies; weighted determinism under a seeded random source; score bounds (no contribution may exceed its weight, no normalised value may leave `[0,1]`); complete candidate accounting; label-based fallback order; and an assertion that no generated reason contains the phrase "best model".

**Fallback and errors (30).** An injectable clock, sleep and random source make every path deterministic: first-success short-circuit, immediate fallback, same-target retry then fallback, non-retryable categories, terminal categories, attempt ceiling, total-timeout exhaustion, zero cost on failed attempts, sequential numbering, `TIMED_OUT` distinction, empty chain. Plus HTTP and thrown-value classification, backoff bounds, and category-to-status mapping.

**Security primitives (37).** Encryption round-trip, IV uniqueness, tamper rejection, key-length validation; password hashing, salting, malformed-hash handling, strength rules; API key generation, hashing, prefix non-authentication, uniqueness across 50 draws, and validation of revoked, expired, wrongly-scoped and environment-mismatched keys; role permissions and escalation limits; audit redaction at depth, in arrays, and case-insensitively.

## Integration — 14

Against real PostgreSQL: request persistence; stored explanation and trace stages; token and cost recording; priority selection; determinism (same prompt, same response); metadata-only logging; fallback attempt recording with a genuine model change; same-target retry ordering; safety-refusal termination; context-limit handling; zero cost on failed attempts; usage rollup incrementing a single row rather than duplicating; quota rejection; quota warning.

## Security — 23

Properties that must hold when someone is actively trying to break them:

- A request in another workspace returns `null` — indistinguishable from missing.
- Policy and application lookups are scoped; a foreign id is invisible.
- One workspace's quota does not constrain another's.
- Keys are unrecoverable from storage; the prefix does not authenticate.
- Revoked, expired and wrongly-scoped keys are rejected.
- **An unknown key and a malformed key return byte-identical rejections.**
- Credentials are stored as ciphertext; passwords are non-recoverable.
- Oversized, over-long, malformed and unknown-role requests are rejected.
- **Routing instructions embedded in prompt content are ignored.**
- Failure messages contain no connection string, no `sk-` token and no stack frame.

## Route verification

`scripts/route-check.mjs` signs in as a real seeded account and visits all 28 routes, asserting 2xx and zero console errors, then confirms all 15 navigation links resolve to implemented pages. This catches a dead link or a runtime error that a type check cannot.

## Demonstration verification

`npm run demo:verify` — 18 assertions that the seeded data matches what each scenario claims, including that keys are stored as SHA-256, that a safety refusal was never retried against another provider, and that no prompt body was persisted.

This is what keeps the demonstration honest: if a change to routing or fallback alters an outcome, it fails, rather than letting the dashboard show a story the code no longer produces.

## Not covered

Component-level UI tests, load and soak testing, chaos beyond injected provider faults, cross-browser (Chromium only), and formal accessibility audit.

## Commands

```bash
npm run verify              # format, lint, typecheck, unit, build
npm run test                # unit
npm run test:integration    # needs the database
npm run test:security       # needs the database
npm run demo:verify         # seeded-data assertions
node scripts/route-check.mjs
```
