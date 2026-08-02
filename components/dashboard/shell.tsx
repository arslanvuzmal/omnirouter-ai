'use client';

import { LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { OmniRouterWordmark } from '@/components/brand/wordmark';
import { Badge, DemoDataNotice } from '@/components/ui/primitives';
import type { WorkspaceRole } from '@/lib/database/generated/enums';

import { DashboardNav } from './nav';

const ROLE_TONE: Record<WorkspaceRole, 'primary' | 'accent' | 'neutral'> = {
  OWNER: 'primary',
  ADMIN: 'primary',
  DEVELOPER: 'accent',
  ANALYST: 'accent',
  VIEWER: 'neutral',
};

export function DashboardShell({
  children,
  workspaceName,
  role,
  userName,
  userEmail,
  isDemoWorkspace,
  logout,
}: {
  children: ReactNode;
  workspaceName: string;
  role: WorkspaceRole;
  userName: string;
  userEmail: string;
  isDemoWorkspace: boolean;
  logout: () => Promise<void>;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-base-800 px-4 py-3 lg:hidden">
        <Link href="/dashboard" aria-label="OmniRouter dashboard">
          <OmniRouterWordmark />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="dashboard-sidebar"
          className="rounded-lg border border-base-700 p-2 text-ink-200 hover:bg-base-800"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="sr-only">
            {mobileOpen ? 'Close navigation' : 'Open navigation'}
          </span>
        </button>
      </div>

      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        className={`${
          mobileOpen ? 'block' : 'hidden'
        } shrink-0 border-b border-base-800 bg-base-900/50 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:border-r lg:border-b-0`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden border-b border-base-800 px-5 py-4 lg:block">
            <Link href="/dashboard" aria-label="OmniRouter dashboard">
              <OmniRouterWordmark />
            </Link>
          </div>

          <div className="border-b border-base-800 px-4 py-3">
            <p className="truncate text-xs font-medium text-ink-50">
              {workspaceName}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={ROLE_TONE[role]}>{role}</Badge>
              {isDemoWorkspace ? <DemoDataNotice /> : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-4">
            <DashboardNav onNavigate={() => setMobileOpen(false)} />
          </div>

          <div className="border-t border-base-800 px-4 py-3">
            <p className="truncate text-xs font-medium text-ink-200">{userName}</p>
            <p className="truncate text-[11px] text-ink-600">{userEmail}</p>
            <form action={logout} className="mt-2.5">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg border border-base-700 px-3 py-1.5 text-xs text-ink-400 transition-colors hover:bg-base-800 hover:text-ink-50"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="border-b border-base-800 px-5 py-5 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-50">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-400">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-2.5">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="space-y-5 px-5 py-6 sm:px-7">{children}</div>;
}
