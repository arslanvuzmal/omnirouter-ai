import type { Metadata } from 'next';

import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'Using the OmniRouter unified completion API: authentication, request shape, response shape, headers and error codes.',
};

const ERROR_CODES = [
  ['invalid_api_key', '401', 'Missing, unknown, revoked or expired key.'],
  ['invalid_request', '400', 'The body failed schema validation.'],
  ['invalid_json', '400', 'The body was not parseable JSON.'],
  ['payload_too_large', '413', 'The body exceeded the size limit.'],
  ['unknown_policy', '400', 'The named policy does not exist in this workspace.'],
  ['idempotency_replay', '409', 'This Idempotency-Key was already processed.'],
  ['quota_exceeded', '429', 'A configured workspace quota rejected the request.'],
  ['rate_limit', '429', 'Every eligible provider rate limited the request.'],
  ['timeout', '504', 'No provider responded within the configured timeout.'],
  ['provider_unavailable', '502', 'Every eligible provider was unavailable.'],
  ['context_limit', '400', 'The request exceeds every eligible model’s context window.'],
];

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <header>
        <Badge tone="primary">API reference</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
          Using the unified API
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          One endpoint, OpenAI-compatible in shape. Point an existing client at it by
          changing the base URL and the key.
        </p>
      </header>

      <section className="mt-10 space-y-5">
        <Panel>
          <PanelHeader title="Endpoint" as="h2" />
          <pre className="overflow-x-auto px-5 py-4 font-mono text-xs text-ink-200">
            {`POST /api/v1/chat/completions
Authorization: Bearer omr_live_xxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json`}
          </pre>
        </Panel>

        <Panel>
          <PanelHeader
            title="Request"
            description="model and policy are optional. Omit both and the environment's default policy decides."
            as="h2"
          />
          <pre className="overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed text-ink-200">
            {`{
  "messages": [
    { "role": "system", "content": "You are a support assistant." },
    { "role": "user", "content": "Draft a reply to this complaint." }
  ],
  "max_tokens": 400,
  "temperature": 0.7,
  "policy": "Balanced production"
}`}
          </pre>
        </Panel>

        <Panel>
          <PanelHeader
            title="Response"
            description="Standard fields plus a namespaced omnirouter block that OpenAI-shaped clients ignore."
            as="h2"
          />
          <pre className="overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed text-ink-200">
            {`{
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
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 63,
    "total_tokens": 73
  },
  "omnirouter": {
    "correlation_id": "ed190580-…",
    "provider": "DEMO",
    "fallback_used": false,
    "attempts": 1,
    "estimated_cost": 0.000039,
    "latency_ms": 540,
    "policy": "Balanced production",
    "strategy": "BALANCED",
    "routing_reason": "Astra Fast scored highest against the
      configured scoring policy. 3 candidates were eligible."
  }
}`}
          </pre>
        </Panel>

        <Panel>
          <PanelHeader
            title="Response headers"
            description="Present on both success and failure, so a failed request is still traceable."
            as="h2"
          />
          <pre className="overflow-x-auto px-5 py-4 font-mono text-xs leading-relaxed text-ink-200">
            {`x-omnirouter-correlation-id: ed190580-fd01-44a3-9e46-eb20fe7f435e
x-omnirouter-fallback-used: false
x-omnirouter-attempts: 1
x-omnirouter-quota-warning: (only when a quota threshold is crossed)`}
          </pre>
        </Panel>

        <Panel>
          <PanelHeader
            title="Idempotency"
            description="Send an Idempotency-Key header to guarantee at-most-once execution per workspace. A replay returns 409 with the original correlation id."
            as="h2"
          />
          <pre className="overflow-x-auto px-5 py-4 font-mono text-xs text-ink-200">
            {`Idempotency-Key: order-4821-summary`}
          </pre>
        </Panel>

        <Panel>
          <PanelHeader
            title="Errors"
            description="Provider error text is never forwarded — it can echo prompt content or internal endpoints."
            as="h2"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">API error codes</caption>
              <thead>
                <tr className="border-b border-base-700 text-left">
                  <th className="px-5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Code
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    HTTP
                  </th>
                  <th className="px-5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Meaning
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {ERROR_CODES.map(([code, status, meaning]) => (
                  <tr key={code}>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-ink-200">
                      {code}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-ink-400">
                      {status}
                    </td>
                    <td className="px-5 py-2.5 text-[11px] text-ink-400">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}
