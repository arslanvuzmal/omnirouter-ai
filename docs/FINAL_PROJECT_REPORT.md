# Final project report

**Project:** OmniRouter AI
**Owner:** Arslan Vuzmal Lone
**Date:** 2 August 2026

---

## 1. Executive summary

OmniRouter AI is an AI operations control plane: a business connects its AI providers once, defines routing policies in an interface, and calls a single endpoint. When a provider fails, the platform classifies the failure and recovers according to that category's policy. Every request leaves a stored, readable account of what happened.

The distinguishing contribution is that **a routing decision is a persisted artefact, not a log line** — including the candidates rejected and why. That record survives the policy that produced it.

The application is complete and verified locally. `npm run verify` passes, 124 tests pass, all 28 routes render, and 18/18 demonstration checks hold.

**Publication to GitHub and deployment to Vercel remain blocked on GitHub authentication**, which requires an interactive login only the project owner can perform.

---

## 2. Research reviewed

Read-only study of five public projects, documented in `docs/RESEARCH_NOTES.md`:

| Project            | Licence                            | Lesson taken                                                   |
| ------------------ | ---------------------------------- | -------------------------------------------------------------- |
| BerriAI/litellm    | MIT (with `enterprise/` carve-out) | A normalised provider envelope is the load-bearing abstraction |
| Portkey-AI/gateway | MIT                                | Routing belongs in declarative config, not imperative code     |
| langfuse/langfuse  | MIT (with `ee/` carve-out)         | A trace is a persisted entity, not a log line                  |
| Helicone/helicone  | Apache-2.0                         | Errors must be grouped by category to be actionable            |
| vercel/chatbot     | Apache-2.0                         | App Router structure; DB sessions over JWT                     |

No source, schema, branding or copy was reproduced. Enterprise-licensed directories were deliberately not inspected.

---

## 3. Original architectural decisions

Full reasoning in `docs/DECISIONS.md`. The five that most shaped the result:

1. **The routing decision is stored, not logged** — with rejected candidates and a per-factor score breakdown.
2. **One execution path** — the API, playground and demo all call `runCompletion`, so a demonstration cannot drift from production.
3. **Failures are classified before retry** — eleven categories, each with its own policy and stated rationale.
4. **`SAFETY_REFUSAL` blocks fallback** — a gateway that shops a refused prompt until one provider complies is a safety-control bypass.
5. **Metadata-only logging by default** — prompt bodies are not retained without an explicit opt-in.

---

## 4. Location

|                      |                                                              |
| -------------------- | ------------------------------------------------------------ |
| **Project**          | `D:\OmniRouter AI`                                           |
| **Desktop shortcut** | `C:\Users\laptopzone\Desktop\OmniRouter AI.lnk`              |
| **Backup**           | Not required — no pre-existing project was found or modified |

Relocated from `C:\Users\laptopzone\Desktop\OmniRouter AI` during the build: the C: drive fell to 1.1 GB free and Docker Desktop terminated twice under the pressure. The move was verified with `robocopy` (864 MB, zero failures) and confirmed intact — git history, identity, `.env.local` and `node_modules` all preserved, nothing reinstalled.

---

## 5. Technology

Next.js 16.2.12 · React 19.2.8 · TypeScript 6.0.3 (strict) · Tailwind CSS 4.3.3 · PostgreSQL 16 · Prisma 7.9.1 with the `pg` driver adapter · Zod 4.4.3 · Vitest 4.1.10 · Playwright 1.62.1 · ESLint 9.39.5 · Prettier 3.9.6

**Two pins that look like oversights and are not:**

- **TypeScript 6.0.3, not 7.0.2** — `typescript-eslint` peer-caps at `<6.1.0`; TS 7 would silently disable linting.
- **ESLint 9, not 10** — `eslint-plugin-react` calls `context.getFilename()`, removed in ESLint 10; linting crashed on the first JSX file.

---

## 6–8. Data, authentication, tenancy

**21 entities.** Every tenant-scoped table carries `workspaceId`, so isolation is one indexed predicate. `Request` → `RequestAttempt` forms the trace. JSONB is used only where shape must vary. `AuditLog` is append-only by construction.

**Authentication** — scrypt passwords with per-password salt and embedded cost parameters; database-backed sessions storing only the token's SHA-256, revocable immediately, never in `localStorage`; login throttling with counters on the user row.

**Tenancy** — five roles enforced server-side before every mutation, with rank-limited role assignment so an admin cannot mint an owner.

---

## 9–13. Platform

**Providers** — seven adapters. Four share an OpenAI-compatible implementation; Anthropic and Gemini have their own because their contracts differ materially; the demo provider runs in-process and deterministically.

**Routing** — eight strategies over a shared filter pipeline, each emitting a `RouteExplanation`.

**Fallback** — eleven categories with per-category retry policy, bounded by both attempt count and total timeout, using full-jitter backoff.

**API keys** — SHA-256 only, scoped to one application and one environment, revocable instantly. Unknown and malformed keys return byte-identical rejections.

**Prompts** — immutable versions with a moving active pointer.

---

## 14–17. Analytics, demo, security

**Analytics** computed from persisted rows: success rate, fallback rate, P50/P95 latency, tokens, estimated cost, distributions by model, provider and application, and errors grouped by category.

**Demonstration** — 17 scenarios executed through the real gateway, plus 181 generated requests spread across 30 days. Every request row, attempt row, explanation and trace is genuine gateway output.

**Security controls** listed in `docs/SECURITY_MODEL.md`; threats and accepted risks in `docs/THREAT_MODEL.md`.

---

## 18–20. Verification

| Suite                         | Result                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| Unit                          | **87 passed**                                                   |
| Integration (real PostgreSQL) | **14 passed**                                                   |
| Security (real PostgreSQL)    | **23 passed**                                                   |
| **Total**                     | **124 passed, 0 failed**                                        |
| `npm run verify`              | **passed** — format, lint, typecheck, unit, build               |
| Route check                   | **28/28 routes 2xx**, 15/15 nav links resolve, 0 console errors |
| `demo:verify`                 | **18/18 checks passed**                                         |
| Production build              | **passed** — 30 routes compiled                                 |

### Defects found and fixed

Found by inspecting real output rather than assuming correctness:

1. **Fallback order stored internal ids** where a human reading the trace needed model names.
2. **A simulated timeout recorded 0 ms** — the demo provider threw before doing any work, misrepresenting a stalled provider. It now consumes real elapsed time (~1,500 ms).
3. **A compound unique constrained nothing** — `UsageDaily` included a nullable column, and PostgreSQL treats NULLs as distinct, so duplicate aggregate rows would have inserted silently.
4. **Screenshots captured mid-animation** — Recharts animates on mount; animation is now disabled, which also respects reduced-motion preferences.

---

## 21–26. Repository and authorship

|                                    |                                                                 |
| ---------------------------------- | --------------------------------------------------------------- |
| **Commits**                        | 8, conventional messages                                        |
| **Latest**                         | `d67a1a8` docs: complete portfolio and deployment documentation |
| **Author**                         | Arslan Vuzmal Lone `<arslanvuzmallone@gmail.com>`               |
| **Committer**                      | Arslan Vuzmal Lone `<arslanvuzmallone@gmail.com>`               |
| **Distinct identities in history** | 1                                                               |

**Secret scan:** `.env` and `.env.local` confirmed gitignored; no generated secret appears in any tracked file; no provider-key or virtual-key shapes committed; screenshots show only masked key prefixes.

**AUTOMATED ASSISTANT CONTRIBUTOR STATUS: NOT PRESENT — VERIFIED**

Full audit in `docs/AUTHORSHIP_AUDIT.md`.

---

## 27–31. Deployment status and assets

**GitHub — blocked.** `gh auth status` reports no authenticated host. Repository creation and push require an interactive login. Everything is committed locally and ready.

**Vercel — authenticated** as `avuzmal`, but deployment depends on the repository and a Supabase database.

**Supabase — not yet provisioned.**

**Portfolio assets:** 12 screenshots in `portfolio/screenshots/`, plus `case-study/CASE_STUDY.md`, `fiverr/GALLERY_PLAN.md`, `video/VIDEO_SCRIPT.md` and `video/SHOT_LIST.md`.

### Demo credentials

`owner@` · `admin@` · `developer@` · `viewer@omnirouter.demo` — password `OmniDemo!2026`. Fictional workspace, no real credentials, protected against destructive operations.

### Known limitations

Stated in full in `docs/KNOWN_LIMITATIONS.md`. Principally: no third-party audit or certification; token counts heuristic and costs estimated; demo models fictional; credential-backed adapters not run against live paid endpoints; no key rotation for `ENCRYPTION_KEY`; no distributed rate limiting; no uptime claim.

---

## 32. Recommended demonstration flow

1. `/` — the problem, in one screen
2. `/demo/story` — six steps, about a minute
3. Pause on step 4–5: the provider stalls, retries, then a different model succeeds
4. Open the full request trace — every attempt, timing, cost and the decision behind it
5. Step 6 — a safety refusal is returned, not routed around
6. `/dashboard/analytics` — thirty days of real traffic

The attempt strip is the moment the product lands. Give it room.

---

## Summary

```
LOCAL PROJECT:      D:\OmniRouter AI
BACKUP:             not required — no pre-existing project found
GITHUB:             BLOCKED — gh not authenticated
LATEST COMMIT:      d67a1a8
GIT AUTHOR:         Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>
GIT COMMITTER:      Arslan Vuzmal Lone <arslanvuzmallone@gmail.com>

AUTOMATED ASSISTANT CONTRIBUTOR STATUS:
NOT PRESENT — VERIFIED

CI:                 workflow committed, not yet run (needs the remote)
VERCEL:             authenticated as avuzmal; awaiting repository + database
DATABASE:           PostgreSQL 16 local (:5435), 21 tables, migrated
TESTS:              124 passed, 0 failed
BUILD:              passed — 30 routes
DEMO:               18/18 checks passed, 206 requests across 30 days
SCREENSHOTS:        12 captured from the running application

KNOWN BLOCKERS:
  1. GitHub authentication — run: gh auth login
  2. Supabase project not provisioned (needs DATABASE_URL + DIRECT_URL)
```
