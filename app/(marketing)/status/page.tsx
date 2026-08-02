import type { Metadata } from 'next';

import { Badge, Panel, PanelHeader, Stat } from '@/components/ui/primitives';
import { prisma } from '@/lib/database/client';
import { formatRelative } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Live health of this deployment and its configured providers.',
};

/**
 * Deployment status.
 *
 * Reports what can actually be measured: whether the database answers, and what
 * the most recent provider health checks recorded. It makes no availability
 * claim, because a single page load is not an uptime measurement.
 */
export default async function StatusPage() {
  let databaseOk = true;
  let requestCount = 0;
  let connections: Array<{
    id: string;
    label: string;
    kind: string;
    healthState: string;
    lastCheckedAt: Date | null;
  }> = [];

  try {
    const [count, rows] = await Promise.all([
      prisma.request.count(),
      prisma.providerConnection.findMany({
        select: {
          id: true,
          label: true,
          kind: true,
          healthState: true,
          lastCheckedAt: true,
        },
        orderBy: { label: 'asc' },
      }),
    ]);
    requestCount = count;
    connections = rows;
  } catch {
    databaseOk = false;
  }

  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <header>
        <Badge tone="primary">Status</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
          Deployment status
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
          Measured at page load. This is a demonstration deployment and carries
          no availability commitment.
        </p>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        <Stat
          label="Database"
          value={databaseOk ? 'Reachable' : 'Unreachable'}
          tone={databaseOk ? 'success' : 'danger'}
          hint={databaseOk ? 'Query answered' : 'Query failed'}
        />
        <Stat
          label="Mode"
          value={demoMode ? 'Demo' : 'Live'}
          tone={demoMode ? 'warning' : 'primary'}
          hint={
            demoMode
              ? 'Deterministic in-process provider'
              : 'Configured provider credentials'
          }
        />
        <Stat
          label="Requests recorded"
          value={requestCount.toLocaleString()}
          hint="Across all workspaces"
        />
      </dl>

      <Panel className="mt-6">
        <PanelHeader
          title="Provider connections"
          description="State from the most recent recorded health check."
          as="h2"
        />
        {connections.length === 0 ? (
          <p className="px-5 py-4 text-xs text-ink-600">
            No provider connections are configured.
          </p>
        ) : (
          <ul className="divide-y divide-base-800">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-xs text-ink-50">{connection.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-ink-600">
                    {connection.kind}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-600">
                    {connection.lastCheckedAt
                      ? formatRelative(connection.lastCheckedAt)
                      : 'never checked'}
                  </span>
                  <Badge
                    tone={
                      connection.healthState === 'HEALTHY'
                        ? 'success'
                        : connection.healthState === 'DEGRADED'
                          ? 'warning'
                          : connection.healthState === 'UNAVAILABLE'
                            ? 'danger'
                            : 'neutral'
                    }
                  >
                    {connection.healthState.toLowerCase()}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="mt-6 text-[11px] leading-relaxed text-ink-600">
        This page reports only what it can measure at request time. It does not
        claim an uptime percentage, and no independent monitoring is attached to
        this deployment.
      </p>
    </div>
  );
}
