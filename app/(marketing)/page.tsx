import {
  ArrowRight,
  Braces,
  GitBranch,
  KeyRound,
  LineChart,
  ShieldCheck,
  Timer,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';

import { Badge, Panel } from '@/components/ui/primitives';

const FEATURES = [
  {
    icon: Workflow,
    title: 'Explainable routing',
    body: 'Eight selection strategies, each producing a stored explanation naming every candidate considered, every candidate rejected, and why.',
  },
  {
    icon: GitBranch,
    title: 'Controlled fallback',
    body: 'Failures are classified into eleven categories before anything is retried. An authentication error is never hammered; a safety refusal is never shopped to another provider.',
  },
  {
    icon: Timer,
    title: 'Request traces',
    body: 'Every request opens into a stage-by-stage timeline with per-attempt latency, tokens and cost — including the attempts that failed.',
  },
  {
    icon: KeyRound,
    title: 'Virtual API keys',
    body: 'Per-application, per-environment keys stored only as a SHA-256 hash. Shown once, revocable instantly, scoped and expiring.',
  },
  {
    icon: LineChart,
    title: 'Usage analytics',
    body: 'Success rate, fallback rate, P50 and P95 latency, token volume and estimated cost — computed from real rows, not decorative charts.',
  },
  {
    icon: ShieldCheck,
    title: 'Workspace isolation',
    body: 'Five roles enforced on the server. Provider credentials encrypted with AES-256-GCM. Content logging defaults to metadata only.',
  },
];

const STRATEGIES = [
  'Manual',
  'Priority',
  'Weighted',
  'Lowest estimated cost',
  'Lowest recent latency',
  'Reliability first',
  'Capability match',
  'Balanced',
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="surface-glow relative overflow-hidden border-b border-base-800">
        <div className="surface-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="max-w-3xl">
            <Badge tone="primary">AI operations control plane</Badge>

            <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight text-ink-50 sm:text-5xl">
              One secure control plane for your AI models, applications,
              routing policies, usage and failures.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-400">
              OmniRouter sits between your product and every AI provider you
              use. It decides which model handles each request, recovers when a
              provider fails, and keeps a readable record of what happened —
              so an outage becomes a line in a trace instead of an incident.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/demo/story"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary-500 px-5 text-sm font-semibold text-base-950 transition-colors hover:bg-primary-400"
              >
                Watch the 60-second story
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-base-600 bg-base-800 px-5 text-sm font-medium text-ink-50 transition-colors hover:bg-base-700"
              >
                Sign in to the demo workspace
              </Link>
            </div>

            <p className="mt-4 text-xs text-ink-600">
              The demonstration runs on a deterministic in-process provider. No
              external API key is required, and no request leaves the
              deployment.
            </p>
          </div>
        </div>
      </section>

      {/* The problem */}
      <section className="border-b border-base-800">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
                The problem this solves
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-400">
                A team ships an AI feature against one provider. It works. Then
                the provider rate-limits at peak, or returns a 500, or triples
                in price, or a newer model becomes the better fit.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">
                Now the provider call is spread across a dozen files, no one can
                say what a request actually cost, and adding a second provider
                means touching every one of them.
              </p>
            </div>

            <Panel className="p-6">
              <h3 className="text-sm font-semibold text-ink-50">
                What OmniRouter changes
              </h3>
              <ul className="mt-4 space-y-3.5">
                {[
                  'Your application calls one endpoint and never learns which provider served it.',
                  'Routing is a policy an operator edits in the interface, not a branch in application code.',
                  'A provider failure triggers a classified, bounded fallback instead of an exception.',
                  'Every request leaves a trace explaining the decision, the attempts and the cost.',
                  'Credentials live encrypted in one place, behind virtual keys you can revoke.',
                ].map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-ink-200">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400"
                    />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-base-800">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
            Built like an operations tool, not a chat wrapper
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Panel key={feature.title} className="p-5">
                <feature.icon
                  className="h-5 w-5 text-primary-400"
                  aria-hidden="true"
                />
                <h3 className="mt-3.5 text-sm font-semibold text-ink-50">
                  {feature.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">
                  {feature.body}
                </p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* Strategies */}
      <section className="border-b border-base-800">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <Braces className="h-5 w-5 text-accent-400" aria-hidden="true" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-50">
                A routing decision you can read afterwards
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-ink-400">
                Most gateways log which model they picked. OmniRouter stores{' '}
                <em className="text-ink-200 not-italic">why</em> — as structured
                data attached to the request, including the candidates that were
                filtered out and the reason each one was dropped.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-400">
                That record survives the policy that produced it, so a decision
                made last month is still explainable after the policy has been
                edited.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                {STRATEGIES.map((strategy) => (
                  <Badge key={strategy} tone="accent">
                    {strategy}
                  </Badge>
                ))}
              </div>
            </div>

            <Panel>
              <div className="border-b border-base-700 px-5 py-3">
                <span className="font-mono text-[11px] text-ink-400">
                  routeExplanation
                </span>
              </div>
              <pre className="overflow-x-auto px-5 py-4 font-mono text-[11px] leading-relaxed text-ink-200">
                {`{
  "strategy": "BALANCED",
  "selectedCandidate": {
    "modelLabel": "astra-fast",
    "providerKind": "DEMO"
  },
  "reason": "Astra Fast scored highest
    against the configured scoring
    policy. 3 candidates were eligible.",
  "rejectedCandidates": [
    {
      "modelLabel": "nimbus-reasoning",
      "reason": "missing_capability",
      "detail": "Does not support required
        capability: vision."
    }
  ],
  "fallbackOrder": ["astra-pro", "local-ember"]
}`}
              </pre>
            </Panel>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section>
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Panel className="surface-glow overflow-hidden p-8 text-center sm:p-12">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-50">
              See a provider fail and recover, in sixty seconds
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-400">
              Client Story Mode walks through creating an application, defining
              a balanced policy, sending a request, simulating a provider
              timeout, and watching the fallback succeed — with the trace open
              the whole time.
            </p>
            <Link
              href="/demo/story"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-lg bg-primary-500 px-6 text-sm font-semibold text-base-950 transition-colors hover:bg-primary-400"
            >
              Start the guided demo
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Panel>
        </div>
      </section>
    </>
  );
}
