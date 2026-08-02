import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { MarketingShell } from '@/components/marketing/shell';
import { Badge, Panel } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Demo',
  description:
    'Two ways to explore OmniRouter: a guided sixty-second walkthrough, or full dashboard access with a demo account.',
};

const ACCOUNTS = [
  ['owner@omnirouter.demo', 'Owner', 'Full access including workspace settings'],
  ['admin@omnirouter.demo', 'Admin', 'Everything except workspace deletion'],
  ['developer@omnirouter.demo', 'Developer', 'Playground, prompts, dev keys'],
  ['viewer@omnirouter.demo', 'Viewer', 'Read-only — try running a request'],
];

export default function DemoPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-5 py-16">
        <header>
          <Badge tone="primary">Demo</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
            Two ways in
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
            The demonstration runs entirely on a deterministic in-process
            provider. No external API key is required, and no request leaves this
            deployment.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Panel className="flex flex-col p-6">
            <h2 className="text-sm font-semibold text-ink-50">
              Guided walkthrough
            </h2>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-400">
              Six steps, about a minute. Watch a request route, a provider fail,
              and the fallback recover — reading real seeded requests rather than
              screenshots.
            </p>
            <Link
              href="/demo/story"
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 text-sm font-semibold text-base-950 transition-colors hover:bg-primary-400"
            >
              Start the walkthrough
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Panel>

          <Panel className="flex flex-col p-6">
            <h2 className="text-sm font-semibold text-ink-50">
              Full dashboard access
            </h2>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-ink-400">
              Sign in as any of four roles and use the product directly —
              playground, routing policies, request traces and analytics.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-base-600 bg-base-800 px-4 text-sm font-medium text-ink-50 transition-colors hover:bg-base-700"
            >
              Sign in
            </Link>
          </Panel>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight text-ink-50">
            Demo accounts
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Each role sees a different subset of the product. Signing in as the
            viewer and trying to run a request is the quickest way to see that
            permissions are enforced on the server rather than by hiding buttons.
          </p>

          <div className="mt-5 space-y-2">
            {ACCOUNTS.map(([email, role, note]) => (
              <Panel
                key={email}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-ink-50">{email}</p>
                  <p className="mt-0.5 text-[11px] text-ink-600">{note}</p>
                </div>
                <Badge
                  tone={
                    role === 'Owner' || role === 'Admin'
                      ? 'primary'
                      : role === 'Viewer'
                        ? 'neutral'
                        : 'accent'
                  }
                >
                  {role}
                </Badge>
              </Panel>
            ))}
          </div>

          <p className="mt-4 font-mono text-xs text-ink-400">
            Password for all demo accounts:{' '}
            <span className="text-ink-50">OmniDemo!2026</span>
          </p>

          <p className="mt-4 text-[11px] leading-relaxed text-ink-600">
            The demo workspace is protected: destructive operations are disabled
            because the data is shared between visitors. It contains no real
            provider credentials and cannot reach a production system.
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}
