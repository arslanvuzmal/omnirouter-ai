# Provider adapters

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

---

## The contract

Every provider is coerced into one request shape and one response shape. Once that holds, routing, fallback, cost accounting, tracing and analytics become provider-agnostic and need no per-provider special cases.

```ts
interface ProviderAdapter {
  readonly kind: ProviderKind;
  readonly displayName: string;
  readonly requiresCredential: boolean;

  listModels(context): Promise<ProviderModelInfo[]>;
  healthCheck(context): Promise<HealthResult>;
  chatCompletion(request, context): Promise<CompletionResponse>;
  streamChatCompletion(request, context): AsyncIterable<StreamChunk>;
  estimateTokens(text): number;
  normaliseError(error): NormalisedError;
  supportsCapability(modelId, capability): boolean;
}
```

**Request:**

```ts
{ messages, model, temperature?, maxTokens?, stream?, structuredOutputSchema?, metadata? }
```

**Response:**

```ts
{
  requestId, provider, model, content, finishReason,
  usage: { inputTokens, outputTokens, totalTokens },
  estimatedCost, latencyMs, providerRequestId, metadata
}
```

`ProviderContext` is supplied by the gateway, never by the client: decrypted credential, base URL, timeout, correlation id, and — for the demo provider only — fault-injection directives.

---

## Implementations

| Adapter              | Credential | Basis                                    |
| -------------------- | ---------- | ---------------------------------------- |
| `DemoProvider`       | none       | In-process, deterministic                |
| `OpenAIProvider`     | required   | OpenAI-compatible base                   |
| `OpenRouterProvider` | required   | OpenAI-compatible base                   |
| `DeepSeekProvider`   | required   | OpenAI-compatible base                   |
| `OllamaProvider`     | **none**   | OpenAI-compatible base, addressed by URL |
| `AnthropicProvider`  | required   | Dedicated                                |
| `GeminiProvider`     | required   | Dedicated                                |

Four share one implementation because their wire contracts are identical — only base URL, credential handling and model naming differ. Writing four near-copies would have been four places for a bug to hide.

### Why Anthropic and Gemini are separate

**Anthropic:** the system prompt is a top-level `system` field rather than a message with role `system`, and content returns as an array of typed blocks rather than a string. Structured output is expressed as a forced single-tool call.

**Gemini:** messages are `contents` with role `model` rather than `assistant`; the system prompt is `systemInstruction`; generation parameters nest under `generationConfig`; and the credential is a header rather than a bearer token. Model names arrive fully qualified (`models/gemini-…`) and are normalised.

---

## Shared HTTP behaviour

`http-base.ts` centralises the fetch, the timeout and the error classification, so every adapter fails in the same vocabulary — which is what lets the fallback engine reason about failures without knowing which provider produced them.

- `AbortController` enforces the per-attempt timeout.
- Non-2xx maps to a category by status code.
- `Retry-After` is parsed as either seconds or an HTTP date.
- A non-JSON body raises `MALFORMED_RESPONSE` rather than throwing a parse error.
- **Provider error text is never forwarded** — it can echo prompt content, internal endpoints or account identifiers.

---

## The demo provider

The reason the whole platform is demonstrable with no credential and no network access.

### Determinism

Every output derives from `SHA-256(model + canonical messages)`, seeding a mulberry32 PRNG. The same prompt against the same model always produces the same response, the same token counts and the same latency.

That is what makes a recorded demonstration reproducible, and what makes the comparison screen meaningful rather than noise.

### Models

| Model            | Context | Capabilities          | Input / Output per 1M | Latency   |
| ---------------- | ------- | --------------------- | --------------------- | --------- |
| Astra Fast       | 32k     | streaming, structured | $0.15 / $0.60         | ~320 ms   |
| Astra Pro        | 200k    | + vision, tools       | $3.00 / $15.00        | ~900 ms   |
| Nimbus Reasoning | 128k    | + tools               | $1.10 / $4.40         | ~1,600 ms |
| Local Ember      | 8k      | streaming             | $0 / $0               | ~640 ms   |

**These models are fictional.** They are marked _"Demo model — no external provider request"_ throughout the interface. They are not proxies for, and make no claim about, any real commercial model. Their relative speeds and prices were chosen to make routing behaviour visible, not to model any real market.

### Fault injection

`forceTimeout`, `forceRateLimit`, `forceUnavailable`, `forceAuthFailure`, `forceContextLimit`, `forceSafetyRefusal`, `forceMalformed`, `forceLatencyMs`.

Faults are evaluated **before** simulated work, except `forceTimeout` — which sleeps first, because a timeout recorded as `0 ms` would misrepresent what a stalled provider actually does. This was a real defect, found by reading a rendered trace rather than assuming the code was right.

Scope controls how widely a fault applies:

| Scope             | Effect                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `all`             | Every attempt fails — demonstrates terminal failure                                            |
| `first_attempt`   | Only the opening call fails — demonstrates a same-target **retry** succeeding                  |
| `first_candidate` | Every attempt against the primary fails — produces a genuine **fallback** to a different model |

The distinction matters: with a first-attempt-only fault, `TIMEOUT` recovers on its own retry, so the demonstration shows a retry rather than a fallback.

---

## Capabilities

Capabilities are declared **per model in the workspace catalogue**, not hardcoded, because provider line-ups change faster than this code would. `capabilityFromPatterns` provides a conservative default for a model not yet catalogued.

---

## Honesty about coverage

The demo provider is fully exercised, including every failure path.

The six credential-backed adapters are written against each provider's published contract and tested against recorded response shapes. **They have not been run against live paid endpoints.** That is a deliberate trade-off: it keeps the project verifiable by anyone without requiring a paid credential. A real deployment should validate each adapter against its provider before relying on it.

This is stated here, in `KNOWN_LIMITATIONS.md`, and in the README — not buried.
