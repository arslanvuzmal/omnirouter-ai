# Case study — OmniRouter AI

**Built by Arslan Vuzmal Lone**

---

## The brief I set myself

Build something that demonstrates I can ship a production-shaped SaaS product, not a demo that falls over when you click the second thing.

The test I applied throughout: **could a technical founder open this and believe a team runs on it?**

---

## The problem

A team ships an AI feature against one provider. It works.

Then the provider rate-limits at peak. Or returns a 500 during a customer demo. Or triples in price. Or a better model appears.

By then the provider call is spread across a dozen files, nobody can say what a request actually cost, and adding a second provider means touching every one of them.

---

## What I built

An **AI operations control plane**. The application calls one endpoint; a policy decides which model serves it; failures are classified and recovered from; and every decision is recorded in a form a human can read afterwards.

### The distinguishing idea

Most gateways log _which_ model handled a request. OmniRouter persists **why** — as structured data on the request, including the candidates it rejected and the reason each was dropped.

That record survives the policy that produced it. A decision made last month is still explainable after the policy has been edited.

---

## Three decisions I'd defend in an interview

### 1. One execution path

The public API, the playground and the guided demo all call the same `runCompletion`.

A demonstration that runs different code proves nothing about production. Sharing the path means the demo cannot silently drift, and every bug the demo surfaces is a real bug.

### 2. Failures are classified before they're retried

Uniform retry is not neutral — it's harmful. Retrying an authentication failure wastes quota and can lock an account. Retrying a validation error can never succeed.

So there are eleven categories, each with its own policy and a stated rationale that surfaces in the interface.

The one I'd point at first: **`SAFETY_REFUSAL` blocks fallback.** A gateway that automatically shops a refused prompt until some provider complies is a mechanism for laundering safety controls. That's a product decision, and the honest default is to respect the refusal.

### 3. Metadata-only logging by default

Prompt and response bodies aren't stored unless a workspace opts in. A customer's prompts may contain their own users' data, and a platform that silently retains it creates an obligation nobody agreed to.

---

## Three bugs I found by looking at real output

I make a point of this because it's the difference between "it compiles" and "it works".

**Fallback order was unreadable.** The stored explanation held internal database ids where a human needed model names. Found by reading the rendered trace, not by running a test.

**A simulated timeout took 0 ms.** The demo provider threw before doing any work, so the attempt recorded no elapsed time — which misrepresents what a stalled provider does. It now burns real time before raising.

**A unique constraint constrained nothing.** `UsageDaily` had a compound unique including a nullable column. In PostgreSQL, NULLs compare as distinct, so two "no model" rows for the same day would both insert and the aggregate would silently drift. Caught by a type error, fixed in the schema rather than cast around.

---

## Two version decisions that look like mistakes until explained

**TypeScript is pinned to 6.0.3, not 7.0.2.** `typescript-eslint` declares a peer range of `<6.1.0`. Adopting the newest TypeScript would have silently disabled every lint rule.

**ESLint is pinned to 9, not 10.** `eslint-plugin-react`, pulled in by `eslint-config-next`, calls an API ESLint 10 removed. Linting crashed on the first JSX file.

Both were caught because the verification pipeline actually runs, rather than being declared and skipped.

---

## What it does

|               |                                                              |
| ------------- | ------------------------------------------------------------ |
| **Database**  | 21 entities, PostgreSQL, workspace isolation on every query  |
| **Providers** | 7 adapters plus a deterministic in-process demo provider     |
| **Routing**   | 8 strategies, each emitting a stored explanation             |
| **Fallback**  | 11-category taxonomy with per-category retry policy          |
| **API**       | OpenAI-compatible, with namespaced routing metadata          |
| **Interface** | 28 routes, no dead links, no console errors                  |
| **Tests**     | 124 — unit, integration and security against real PostgreSQL |

---

## What I deliberately did not build

Listed because scope discipline is part of the work:

Semantic caching · streaming through the unified API · SSO · billing · background queues · image and audio endpoints · evaluation datasets.

And stated plainly in the README: no third-party audit, no compliance certification, no uptime claim, and the credential-backed adapters have not been run against live paid endpoints.

A portfolio project that implies more than it implements is worse than one that scopes itself honestly.

---

## Stack

Next.js 16 · React 19 · TypeScript 6 (strict) · Tailwind 4 · PostgreSQL 16 · Prisma 7 · Zod · Vitest · Playwright · Vercel · Supabase

---

## What this demonstrates

- Designing a relational schema that enforces multi-tenant isolation structurally
- Writing security controls and then testing them adversarially
- Making failure a first-class product feature rather than an exception
- Building an interface an operator can actually work in
- Knowing what to leave out, and saying so

**Arslan Vuzmal Lone**
