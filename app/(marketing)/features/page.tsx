import type { Metadata } from 'next';

import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import { STRATEGY_SUMMARIES } from '@/lib/ai/routing/descriptions';
import { RETRY_POLICIES } from '@/lib/ai/errors';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explainable routing, classified fallback, request traces, virtual API keys, quotas and usage analytics.',
};

const MODULES = [
  {
    title: 'Applications and environments',
    body: 'Each application is an isolated consumer with separate development and production environments. A key issued for one environment cannot address the other, and every request is attributed to exactly one application.',
  },
  {
    title: 'Provider connections',
    body: 'Seven adapters — a deterministic demo provider plus OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek and Ollama. Credentials are encrypted at rest with AES-256-GCM and are never returned to a browser.',
  },
  {
    title: 'Model catalogue',
    body: 'Context window, capabilities, configured pricing, availability and health per model. This is what the routing engine filters and scores on, so it is editable without a deployment.',
  },
  {
    title: 'Virtual API keys',
    body: 'Scoped to one application and environment, stored only as a SHA-256 hash, shown once at creation, revocable instantly without touching a provider credential.',
  },
  {
    title: 'Prompt registry',
    body: 'Immutable versions with a moving active pointer and declared template variables. Rolling back moves the pointer rather than editing history.',
  },
  {
    title: 'Quotas',
    body: 'Per-minute, per-day and per-month caps on requests, tokens or estimated cost. Evaluated before a provider is contacted, so a rejected request consumes no provider capacity.',
  },
  {
    title: 'Request traces',
    body: 'Every request stores its lifecycle stages, every provider attempt including failures, and the routing decision that produced it.',
  },
  {
    title: 'Audit log',
    body: 'Append-only. There is no code path in the application that updates or deletes an entry, and sensitive values are redacted before a snapshot is written.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <header>
        <Badge tone="primary">Features</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
          What the platform actually does
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          Every capability below is implemented and exercised by the seeded demonstration.
          Where something is deliberately out of scope, it is listed in the roadmap rather
          than implied here.
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {MODULES.map((module) => (
          <Panel key={module.title} className="p-5">
            <h2 className="text-sm font-semibold text-ink-50">{module.title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-400">{module.body}</p>
          </Panel>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-50">
          Eight selection strategies
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
          Each one produces a stored explanation naming every candidate considered and
          rejected. None of them claims to identify an objectively best model — each
          expresses a configured preference.
        </p>

        <div className="mt-6 space-y-2.5">
          {Object.entries(STRATEGY_SUMMARIES).map(([strategy, summary]) => (
            <Panel key={strategy} className="flex flex-wrap gap-4 p-4">
              <div className="w-52 shrink-0">
                <Badge tone="accent">{strategy}</Badge>
              </div>
              <p className="min-w-56 flex-1 text-xs leading-relaxed text-ink-400">
                {summary}
              </p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-50">
          Failure is classified before it is retried
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
          Retrying an authentication failure wastes quota and can lock an account.
          Retrying a validation error can never succeed. Each category carries its own
          policy.
        </p>

        <Panel className="mt-6">
          <PanelHeader
            title="Retry policy by failure category"
            description="Applied by the fallback engine on every request."
            as="h3"
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Retry and fallback policy for each failure category
              </caption>
              <thead>
                <tr className="border-b border-base-700 text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Category
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Retry
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Fallback
                  </th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-800">
                {Object.entries(RETRY_POLICIES).map(([category, policy]) => (
                  <tr key={category}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] text-ink-200">
                        {category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={policy.retrySameTarget ? 'warning' : 'neutral'}>
                        {policy.retrySameTarget ? `${policy.maxRetries}×` : 'no'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={policy.allowFallback ? 'success' : 'danger'}>
                        {policy.allowFallback ? 'allowed' : 'blocked'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] leading-relaxed text-ink-400">
                      {policy.rationale}
                    </td>
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
