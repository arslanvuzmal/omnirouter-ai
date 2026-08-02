# Research Notes

**Author:** Arslan Vuzmal Lone
**Date of inspection:** 31 July 2026
**Method:** Read-only review of public repository metadata, published licences and public documentation. No repository was cloned into this project. No source file was copied, adapted or translated.

---

## Purpose and boundaries

Before designing OmniRouter AI, five well-known projects in the AI gateway and LLM observability space were reviewed to understand established architectural patterns and to make deliberate decisions about what this project would and would not do.

The objective was **architectural literacy, not reuse**. Concretely:

- No source code was copied, adapted, reformatted or machine-translated from any reviewed project.
- No README text, marketing copy, product naming or documentation prose was reproduced.
- No visual design, logo, colour system, icon set or UI layout was reproduced.
- No database schema was reproduced.
- Every type, interface, function, table and route in OmniRouter AI was written independently for this project.

Concepts such as "provider fallback", "weighted routing", "request tracing" and "virtual API keys" are general engineering ideas, not protectable expression. OmniRouter implements them using its own naming, data model, control flow and interface design.

---

## 1. BerriAI/litellm

| Field                   | Value                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Repository              | `BerriAI/litellm`                                                                                                             |
| Description             | AI gateway; call 100+ LLM APIs in OpenAI or native format, with cost tracking, guardrails, load balancing and logging         |
| Licence                 | **MIT**, with a carve-out: content under an `enterprise/` directory is governed by a separate licence in `enterprise/LICENSE` |
| Default branch          | `litellm_internal_staging`                                                                                                    |
| Primary language        | Python (Rust core)                                                                                                            |
| Documentation inspected | `https://docs.litellm.ai/docs/`, `https://docs.litellm.ai/docs/routing`                                                       |
| Files/pages inspected   | Repository metadata, root `LICENSE`, public routing documentation                                                             |
| Date inspected          | 31 July 2026                                                                                                                  |

### Architectural lessons taken

- **A single normalised request/response envelope is the load-bearing abstraction.** Once every provider is coerced into one request shape and one response shape, routing, fallback, cost accounting and logging all become provider-agnostic. This is the single most valuable idea in the category.
- **A model group is not a model.** Routing operates over a _set of deployable targets_ that share a logical name. This separation is what makes load balancing and fallback expressible at all.
- **Deployment cooldowns.** LiteLLM cools down a deployment after a failure threshold (documented: >50% failures in the current minute, or specific status codes such as 429/401/404, default 5s) rather than banning it permanently. Health is a decaying signal, not a boolean.
- **Ordered fallback tiers.** An `order` parameter groups deployments into tiers that cascade on failure.
- **Error-class-aware retry.** Not every failure deserves a retry; authentication failures in particular should not be hammered.

### Documented strategy names (for comparison only)

`simple-shuffle`, `rate-limit-aware-v2`, `latency-based-routing`, `usage-based-routing`, `least-busy`, `cost-based-routing`, `custom`.

OmniRouter does **not** reuse these names or their internals. Its strategies are `MANUAL`, `PRIORITY`, `WEIGHTED`, `LOWEST_ESTIMATED_COST`, `LOWEST_RECENT_LATENCY`, `RELIABILITY_FIRST`, `CAPABILITY_MATCH` and `BALANCED`, each with an independently designed scoring and explanation model.

### Deliberately excluded

- The Python/Rust runtime and the proxy-server process model. OmniRouter is a TypeScript Next.js application.
- Their configuration-file format and CLI surface.
- Anything in the `enterprise/` tree, which is not MIT-licensed.
- The breadth of 100+ providers. Breadth without depth would weaken a portfolio project; OmniRouter ships seven adapters and one fully deterministic demo provider instead.
- Their spend-tracking implementation. OmniRouter computes **estimates** from workspace-configured pricing and labels them as estimates.

### Licensing note

MIT permits commercial reuse with attribution. Because **no code was taken**, no attribution obligation is triggered. The `enterprise/` carve-out was avoided entirely and was not inspected.

---

## 2. Portkey-AI/gateway

| Field                 | Value                                                                             |
| --------------------- | --------------------------------------------------------------------------------- |
| Repository            | `Portkey-AI/gateway`                                                              |
| Description           | AI gateway with integrated guardrails; routes to many LLMs behind one API         |
| Licence               | **MIT**                                                                           |
| Default branch        | `main`                                                                            |
| Primary language      | TypeScript                                                                        |
| Files/pages inspected | Repository metadata, public `README.md`, `https://portkey.ai/features/ai-gateway` |
| Date inspected        | 31 July 2026                                                                      |

### Architectural lessons taken

- **Routing behaviour belongs in a declarative config object, not in imperative code.** A policy that can be serialised can also be versioned, diffed, audited and edited in a UI. This directly shaped OmniRouter's decision to persist routing policies as structured database rows plus a JSONB config blob.
- **Reliability primitives compose.** Retries, timeouts, fallbacks and load balancing are independent layers that stack, rather than one monolithic "retry" feature.
- **Exponential backoff with a hard attempt ceiling** is the documented default posture (their docs cite up to 5 automatic retries).
- **Granular per-request timeouts** matter as much as retries — an unbounded hang is worse than a fast failure.
- **Conditional routing**: request metadata can select a route, which is what makes multi-tenant, per-application policy possible.
- **Guardrails as a separate verification stage** around the provider call, rather than logic tangled into the call itself.

### Deliberately excluded

- Their Hono/edge worker deployment model and plugin system.
- The 40+ prebuilt guardrail catalogue. OmniRouter implements request validation and structured-output validation only, and does not claim to be a content-safety product.
- Their virtual-key and config-ID semantics as a wire format.
- Multi-region orchestration.

### Licensing note

MIT. No code was used, so no attribution obligation arises. The `config` shape shown in their README was read to understand the _concept_ of declarative policy; OmniRouter's `RoutingPolicy`/`RoutingRule` schema and its `RouteExplanation` object were designed independently and share no field names by intent.

---

## 3. langfuse/langfuse

| Field                 | Value                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repository            | `langfuse/langfuse`                                                                                          |
| Description           | Open-source AI engineering platform: evals, observability, metrics, prompt management, playground, datasets  |
| Licence               | **MIT**, with a commercial carve-out: `ee/`, `web/src/ee/` and `worker/src/ee/` are governed by `ee/LICENSE` |
| Default branch        | `main`                                                                                                       |
| Primary language      | TypeScript                                                                                                   |
| Files/pages inspected | Repository metadata, root `LICENSE`, `https://langfuse.com`                                                  |
| Date inspected        | 31 July 2026                                                                                                 |

### Architectural lessons taken

- **A trace is a first-class persisted entity, not a log line.** Modelling a request as a parent record with ordered child observations is what makes a debugging UI possible at all. OmniRouter's `Request` → `RequestAttempt` relationship is the direct descendant of this idea, expressed in its own schema.
- **Prompt management needs immutable versions plus a moving "active" pointer.** Editing a prompt in place destroys the ability to explain a past result. OmniRouter implements `Prompt` + `PromptVersion` with an explicit active version and rollback.
- **A playground and the production path should share one execution engine.** If the playground is a separate code path, it stops being evidence about production behaviour.
- **Timeline visualisation with per-stage durations** is the highest-value debugging surface.

### Deliberately excluded

- Everything under `ee/` — not inspected, not reimplemented. This is a licence boundary and was treated as one.
- Their OpenTelemetry ingestion pipeline, worker architecture and ClickHouse analytics store. OmniRouter aggregates into a `UsageDaily` table in PostgreSQL, which is honest about its scale ceiling.
- Dataset management, LLM-as-judge evaluation and scoring workflows — out of MVP scope.
- Their SDK surface and integration matrix.

### Licensing note

The MIT base permits reuse; the `ee/` directories do not. **No code from either region was used.** The enterprise directories were deliberately not opened, so no proprietary implementation detail could influence this project's design.

---

## 4. Helicone/helicone

| Field                 | Value                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Repository            | `Helicone/helicone`                                                                          |
| Description           | Open-source LLM observability platform; one line of code to monitor, evaluate and experiment |
| Licence               | **Apache License 2.0**                                                                       |
| Default branch        | `main`                                                                                       |
| Primary language      | TypeScript                                                                                   |
| Files/pages inspected | Repository metadata, licence identifier, `https://www.helicone.ai`                           |
| Date inspected        | 31 July 2026                                                                                 |

### Architectural lessons taken

- **Cost and latency are the two metrics an operator actually opens the dashboard for.** Everything else is secondary. This shaped OmniRouter's analytics hierarchy.
- **Errors must be grouped by category, not listed individually.** A list of 400 failures is noise; "312 × RATE_LIMIT on one provider" is an action. This validated OmniRouter's decision to make error classification a persisted, first-class enum rather than a free-text message.
- **Segmentation by arbitrary user-supplied properties** is what turns a chart into an investigation tool. OmniRouter implements a constrained version: filtering by workspace, application, environment, provider, model, status and fallback state.
- **Percentile latency (P50/P95) rather than only averages.** An average latency hides exactly the failures users complain about.
- **Cache visibility as an explicit metric** — if caching is invisible, it cannot be trusted.

### Deliberately excluded

- Their proxy-first ingestion model and edge-worker deployment.
- Their caching implementation. Semantic caching is listed in OmniRouter's roadmap as explicitly _not built_, rather than claimed.
- Session replay and experiment tooling.
- Their pricing/billing surface.

### Licensing note

Apache-2.0 additionally requires preservation of NOTICE files and states patent terms — obligations that attach to **distribution of the licensed work or derivatives**. OmniRouter distributes neither, because no Helicone code, schema or asset is present in this repository. Apache-2.0 was the strictest licence encountered in this review, which reinforced the decision to treat all five projects as read-only reference material.

---

## 5. vercel/chatbot (`vercel/ai-chatbot`)

| Field                 | Value                                                             |
| --------------------- | ----------------------------------------------------------------- |
| Repository            | `vercel/chatbot`                                                  |
| Description           | Full-featured, hackable Next.js AI chatbot built by Vercel        |
| Licence               | **Apache License 2.0**, © 2024 Vercel, Inc.                       |
| Default branch        | `main`                                                            |
| Primary language      | TypeScript                                                        |
| Files/pages inspected | Repository metadata, root `LICENSE`, `https://chatbot.ai-sdk.dev` |
| Date inspected        | 31 July 2026                                                      |

### Architectural lessons taken

- **App Router with Server Components as the default, Client Components only where interaction demands it.** This is the correct default posture for a data-heavy dashboard and is the structure OmniRouter adopts.
- **Streaming is a first-class UX concern**, not an optimisation. A token-by-token response changes perceived latency dramatically.
- **Database-backed sessions over JWT-in-localStorage.** Server-side session state is revocable; a token in `localStorage` is not, and is readable by any XSS.
- **Route groups** (`(marketing)`, `(auth)`, `(dashboard)`) to segment layouts without polluting URL paths.
- **Deploy target shapes the data layer.** A serverless target requires connection pooling discipline, which is why OmniRouter separates `DATABASE_URL` (pooled) from `DIRECT_URL` (migrations).

### Deliberately excluded

- The entire chat product concept. OmniRouter is an operations control plane; its playground is a diagnostic instrument, not a consumer chat product.
- Their UI component tree, styling and layout.
- Their auth configuration and artifact/document features.
- Their AI SDK usage patterns as copied code.

### Licensing note

Apache-2.0. No code, component, style or configuration was copied. OmniRouter's App Router structure follows the framework's own public conventions as documented by Next.js — a framework convention is not this repository's expression.

---

## How OmniRouter AI remains original

| Dimension            | Position                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Source code**      | 100% independently written for this repository. No file originates from a reviewed project.                                                                                                                                                                                                                              |
| **Product concept**  | An _AI operations control plane_ for a business, not a proxy (LiteLLM/Portkey), not an observability SDK (Langfuse/Helicone), not a chat app (vercel/chatbot). The unit of work is a **business application with a routing policy**, not an API call.                                                                    |
| **Data model**       | 21 independently designed entities. `Request` → `RequestAttempt` with a persisted `RouteExplanation` per request is the schema's distinguishing feature.                                                                                                                                                                 |
| **Routing**          | Eight named strategies, each emitting a structured, persisted, human-readable explanation object listing candidates, **rejected** candidates with reasons, and a score breakdown. Explainability as a stored artefact — rather than a runtime log — is the primary original contribution.                                |
| **Failure handling** | An 11-category error taxonomy driving per-category retry policy, with `SAFETY_REFUSAL` treated as non-bypassable by default.                                                                                                                                                                                             |
| **Demo capability**  | A deterministic in-process demo provider with fictional models (Astra Fast, Astra Pro, Nimbus Reasoning, Local Ember) and injectable faults, so the product is fully demonstrable with **zero** external credentials. None of the reviewed projects treats "works with no API key" as a first-class product requirement. |
| **Naming**           | "OmniRouter AI", all model names, all strategy names, all table names and all UI copy are original to this project.                                                                                                                                                                                                      |
| **Visual identity**  | An original dark design system (charcoal base, restrained cyan primary, muted violet secondary) built from scratch.                                                                                                                                                                                                      |

---

## Licensing limitations recorded

1. **Enterprise carve-outs exist** in both `litellm` (`enterprise/`) and `langfuse` (`ee/`, `web/src/ee/`, `worker/src/ee/`). These directories are **not** MIT and were deliberately not inspected.
2. **Apache-2.0 projects** (Helicone, vercel/chatbot) impose notice and patent terms on distribution of the work or derivatives. OmniRouter is neither, so these terms do not attach.
3. **GitHub reports `NOASSERTION`** for litellm, langfuse and vercel/chatbot because their licence files carry preambles or carve-outs that its detector will not auto-classify. Each was therefore read directly rather than trusted from metadata.
4. **No trademark use.** "LiteLLM", "Portkey", "Langfuse", "Helicone" and "Vercel" appear in this document solely as factual references to the projects reviewed. They do not appear in OmniRouter's product surface, branding or marketing copy.

---

## Summary of the resulting design position

OmniRouter AI takes the _category-standard_ ideas — a normalised provider envelope, declarative routing policy, tiered fallback, persisted request traces, versioned prompts, hashed virtual keys — and combines them around one thesis none of the reviewed projects centres on:

> **A routing decision should be a stored, inspectable, explainable artefact that a non-author can read after the fact and understand — including which candidates were rejected and why.**

That thesis drives the schema, the API and the interface.
