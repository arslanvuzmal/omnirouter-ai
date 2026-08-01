import Link from 'next/link';
import type { ReactNode } from 'react';

import { OmniRouterWordmark } from '@/components/brand/wordmark';

const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/architecture', label: 'Architecture' },
  { href: '/docs', label: 'Docs' },
  { href: '/status', label: 'Status' },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-base-800 bg-base-950/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="OmniRouter home">
          <OmniRouterWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-400 transition-colors hover:bg-base-800 hover:text-ink-50"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm text-ink-200 transition-colors hover:bg-base-800 hover:text-ink-50"
          >
            Sign in
          </Link>
          <Link
            href="/demo/story"
            className="rounded-lg bg-primary-500 px-3.5 py-2 text-sm font-semibold text-base-950 transition-colors hover:bg-primary-400"
          >
            Live demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-base-800 bg-base-950">
      <div className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <OmniRouterWordmark />
            <p className="mt-3 text-xs leading-relaxed text-ink-600">
              An AI operations control plane: connect providers, define routing
              policies, and inspect every request your applications make.
            </p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                Product
              </span>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-xs text-ink-600 transition-colors hover:text-ink-200"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                Demo
              </span>
              <Link
                href="/demo/story"
                className="text-xs text-ink-600 transition-colors hover:text-ink-200"
              >
                Client story mode
              </Link>
              <Link
                href="/login"
                className="text-xs text-ink-600 transition-colors hover:text-ink-200"
              >
                Sign in
              </Link>
            </div>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-base-800 pt-6 text-[11px] text-ink-600 sm:flex-row sm:items-center sm:justify-between">
          <p>OmniRouter AI — a portfolio project by Arslan Vuzmal Lone.</p>
          <p>
            Demonstration deployment. Figures shown are derived from seeded
            demo data.
          </p>
        </div>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
