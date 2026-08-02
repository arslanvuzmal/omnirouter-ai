# API reference

**Project:** OmniRouter AI · **Author:** Arslan Vuzmal Lone

## Endpoint

```
POST /api/v1/chat/completions
Authorization: Bearer omr_live_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

The key may also be sent as `x-api-key`. Workspace, application and environment are resolved **from the key**, never from the body — so a caller cannot address another tenant by editing a payload.

## Request

| Field             | Type    | Required | Notes                                              |
| ----------------- | ------- | -------- | -------------------------------------------------- |
| `messages`        | array   | yes      | 1–64 items; roles `system`, `user`, `assistant`    |
| `model`           | string  | no       | Pins a model; switches routing to `MANUAL`         |
| `policy`          | string  | no       | A named active policy in the key's workspace       |
| `max_tokens`      | integer | no       | 1–32,000                                           |
| `temperature`     | number  | no       | 0–2                                                |
| `response_format` | object  | no       | `{ type: "json_schema", json_schema: { schema } }` |

Limits: 1 MB body, 32,000 characters per message, 200,000 characters total.

## Response

Standard OpenAI-shaped fields plus a namespaced block that OpenAI-shaped clients ignore:

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
    "policy": "Balanced production",
    "strategy": "BALANCED",
    "routing_reason": "Astra Fast scored highest against the configured scoring policy."
  }
}
```

## Response headers

Present on **both** success and failure, so a failed request stays traceable:

```
x-omnirouter-correlation-id: <uuid>
x-omnirouter-fallback-used:  true | false
x-omnirouter-attempts:       <n>
x-omnirouter-quota-warning:  <text>   (only when a threshold is crossed)
```

## Idempotency

Send `Idempotency-Key: <your-id>` for at-most-once execution per workspace. A replay returns **409** with the original `correlation_id`.

## Errors

```json
{
  "error": { "message": "…", "type": "omnirouter_error", "code": "…" },
  "correlation_id": "…"
}
```

| Code                   | HTTP | Meaning                                       |
| ---------------------- | ---- | --------------------------------------------- |
| `invalid_api_key`      | 401  | Missing, unknown, revoked or expired          |
| `invalid_request`      | 400  | Failed schema validation                      |
| `invalid_json`         | 400  | Body was not parseable JSON                   |
| `payload_too_large`    | 413  | Body exceeded the size limit                  |
| `unknown_policy`       | 400  | No such active policy in this workspace       |
| `idempotency_replay`   | 409  | This `Idempotency-Key` was already processed  |
| `quota_exceeded`       | 429  | A configured workspace quota rejected it      |
| `rate_limit`           | 429  | Every eligible provider rate limited          |
| `timeout`              | 504  | No provider responded in time                 |
| `provider_unavailable` | 502  | Every eligible provider was unavailable       |
| `context_limit`        | 400  | Exceeds every eligible model's context window |
| `safety_refusal`       | 200  | The provider answered, and declined           |

Provider error text is **never forwarded** — it can echo prompt content, internal endpoints or account identifiers.

## Example

```bash
curl -X POST https://your-deployment/api/v1/chat/completions \
  -H "Authorization: Bearer $OMNIROUTER_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ticket-4821-summary" \
  -d '{
    "messages": [
      { "role": "system", "content": "You are a support assistant." },
      { "role": "user", "content": "Summarise this thread." }
    ],
    "max_tokens": 400,
    "policy": "Balanced production"
  }'
```
