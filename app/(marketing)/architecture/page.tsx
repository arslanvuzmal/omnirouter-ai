import type { Metadata } from 'next';

import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Architecture',
  description:
    'How a request flows through OmniRouter: authentication, quota, routing, execution with classified fallback, normalisation and recording.',
};

const LIFECYCLE = [
  ['Parse and bound', 'Body size is capped before parsing; the payload is validated against a schema with explicit limits on message count and total length.'],
  ['Authenticate', 'The presented key is hashed and matched against the stored hash. Workspace, application and environment come from the key, never from the body.'],
  ['Check scope and expiry', 'A revoked or expired key is rejected before any work is done.'],
  ['Evaluate quotas', 'Consumption for the current window is counted and compared to the configured limits. A rejected request never reaches a provider.'],
  ['Select a route', 'The policy filters candidates on capability, context and cost, then ranks them by its strategy. The full decision — including rejections — is captured.'],
  ['Execute', 'The ranked chain is walked. Each failure is classified, and that classification decides whether to retry, fall back, or stop.'],
  ['Normalise', 'The provider response is mapped into the platform envelope so application code never sees provider-specific shapes.'],
  ['Record', 'Request, attempts, route explanation, trace stages and daily usage are persisted. A correlation id is returned to the caller.'],
];

const DECISIONS = [
  {
    title: 'One execution path',
    body: 'The playground, the guided demo and the public API all call the same runCompletion function. A demonstration is therefore evidence about production behaviour, not a parallel mock that can drift.',
  },
  {
    title: 'The routing decision is stored, not logged',
    body: 'Most gateways log which model they chose. OmniRouter persists why — as structured data on the request, including rejected candidates and the score breakdown. That record outlives the policy that produced it.',
  },
  {
    title: 'Database-backed sessions',
    body: 'The cookie holds an opaque token; the database stores only its SHA-256. A session can be revoked server-side immediately, which a self-contained JWT cannot. Nothing is placed in localStorage.',
  },
  {
    title: 'Metadata-only logging by default',
    body: 'Prompt and response bodies are not retained unless a workspace explicitly opts in. The default posture is the one that retains the least personal data.',
  },
  {
    title: 'Estimates are labelled as estimates',
    body: 'Token counts are heuristic unless a provider reports them, and cost is derived from workspace-configured pricing. Both are presented as estimates rather than as a bill.',
  },
];

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <header>
        <Badge tone="primary">Architecture</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
          How a request flows
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          One endpoint, one execution path, and a stored account of every
          decision made along the way.
        </p>
      </header>

      <section className="mt-10">
        <Panel>
          <PanelHeader
            title="Request lifecycle"
            description="Each stage is timed and recorded on the request for the trace viewer."
            as="h2"
          />
          <ol className="divide-y divide-base-800">
            {LIFECYCLE.map(([title, body], index) => (
              <li key={title} className="flex gap-4 px-5 py-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/12 font-mono text-[10px] text-primary-300">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-ink-50">{title}</h3>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-50">
          Technology
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Panel className="p-5">
            <h3 className="text-sm font-semibold text-ink-50">Application</h3>
            <ul className="mt-2.5 space-y-1 text-xs text-ink-400">
              <li>Next.js 16 with the App Router</li>
              <li>React 19, Server Components by default</li>
              <li>TypeScript in strict mode</li>
              <li>Tailwind CSS 4</li>
              <li>Zod for every external input</li>
            </ul>
          </Panel>
          <Panel className="p-5">
            <h3 className="text-sm font-semibold text-ink-50">Data</h3>
            <ul className="mt-2.5 space-y-1 text-xs text-ink-400">
              <li>PostgreSQL 16</li>
              <li>Prisma 7 via the pg driver adapter</li>
              <li>21 relational entities with enforced workspace isolation</li>
              <li>JSONB only where policy shape must vary</li>
              <li>Supabase-compatible for production</li>
            </ul>
          </Panel>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-ink-50">
          Decisions worth defending
        </h2>
        <div className="mt-5 space-y-3">
          {DECISIONS.map((decision) => (
            <Panel key={decision.title} className="p-5">
              <h3 className="text-sm font-semibold text-ink-50">
                {decision.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
                {decision.body}
              </p>
            </Panel>
          ))}
        </div>
      </section>
    </div>
  );
}
