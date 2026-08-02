'use client';

import {
  Activity,
  BarChart3,
  Boxes,
  FileClock,
  FlaskConical,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListTree,
  Plug,
  ScrollText,
  Settings,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * Dashboard navigation.
 *
 * Every entry resolves to an implemented route. There are no placeholder links:
 * a navigation item that leads nowhere is worse than one that does not exist.
 */

const SECTIONS: Array<{
  label: string;
  items: Array<{ href: string; label: string; icon: typeof LayoutDashboard }>;
}> = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Build',
    items: [
      { href: '/dashboard/applications', label: 'Applications', icon: Boxes },
      { href: '/dashboard/playground', label: 'Playground', icon: FlaskConical },
      { href: '/dashboard/prompts', label: 'Prompts', icon: ScrollText },
    ],
  },
  {
    label: 'Route',
    items: [
      { href: '/dashboard/routing', label: 'Routing policies', icon: Workflow },
      { href: '/dashboard/providers', label: 'Providers', icon: Plug },
      { href: '/dashboard/models', label: 'Models', icon: ListTree },
    ],
  },
  {
    label: 'Operate',
    items: [
      { href: '/dashboard/requests', label: 'Requests', icon: FileClock },
      { href: '/dashboard/health', label: 'Provider health', icon: Activity },
      { href: '/dashboard/quotas', label: 'Quotas', icon: Gauge },
    ],
  },
  {
    label: 'Govern',
    items: [
      { href: '/dashboard/api-keys', label: 'API keys', icon: KeyRound },
      { href: '/dashboard/team', label: 'Team', icon: Users },
      { href: '/dashboard/audit', label: 'Audit log', icon: FileClock },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard" className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <h2 className="px-3 text-[10px] font-semibold tracking-wider text-ink-600 uppercase">
            {section.label}
          </h2>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              // Exact match for the index route, prefix match elsewhere, so a
              // detail page keeps its parent highlighted.
              const active =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors',
                      active
                        ? 'bg-primary-500/12 font-medium text-primary-300'
                        : 'text-ink-400 hover:bg-base-800 hover:text-ink-50',
                    )}
                  >
                    <item.icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-primary-400' : 'text-ink-600',
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
