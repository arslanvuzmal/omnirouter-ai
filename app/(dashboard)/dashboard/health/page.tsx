import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { HealthBadge } from '@/components/dashboard/status';
import {
  Badge,
  DemoDataNotice,
  EmptyState,
  Panel,
  PanelHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatLatency, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Provider health' };

export default async function HealthPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const [connections, checks] = await Promise.all([
    prisma.providerConnection.findMany({
      where: { workspaceId },
      include: { _count: { select: { models: true } } },
      orderBy: { label: 'asc' },
    }),
    prisma.providerHealthCheck.findMany({
      where: { workspaceId },
      include: { connection: { select: { label: true, kind: true } } },
      orderBy: { checkedAt: 'desc' },
      take: 40,
    }),
  ]);

  const healthy = connections.filter((c) => c.healthState === 'HEALTHY').length;
  const degraded = connections.filter((c) => c.healthState === 'DEGRADED').length;
  const unavailable = connections.filter(
    (c) => c.healthState === 'UNAVAILABLE',
  ).length;

  return (
    <>
      <PageHeader
        title="Provider health"
        description="Health is a decaying signal, not a boolean. A degraded provider is deprioritised by reliability-aware routing rather than removed outright."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Connections" value={connections.length} />
          <Stat label="Healthy" value={healthy} tone="success" />
          <Stat
            label="Degraded"
            value={degraded}
            tone={degraded > 0 ? 'warning' : 'neutral'}
          />
          <Stat
            label="Unavailable"
            value={unavailable}
            tone={unavailable > 0 ? 'danger' : 'neutral'}
          />
        </dl>

        <Panel>
          <PanelHeader title="Current state" />
          {connections.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No connections to monitor"
                description="Connect a provider to begin recording health checks."
              />
            </div>
          ) : (
            <Table
              caption="Current provider health"
              head={
                <>
                  <Th>Connection</Th>
                  <Th>Kind</Th>
                  <Th>Health</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Models</Th>
                  <Th>Last checked</Th>
                </>
              }
            >
              {connections.map((connection) => (
                <tr key={connection.id}>
                  <Td className="text-xs text-ink-50">{connection.label}</Td>
                  <Td>
                    <Badge tone="neutral">{connection.kind}</Badge>
                  </Td>
                  <Td>
                    <HealthBadge state={connection.healthState} />
                  </Td>
                  <Td>
                    <Badge
                      tone={connection.status === 'ACTIVE' ? 'success' : 'danger'}
                    >
                      {connection.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {connection._count.models}
                  </Td>
                  <Td className="text-xs text-ink-400">
                    {connection.lastCheckedAt
                      ? formatRelative(connection.lastCheckedAt)
                      : '—'}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Check history"
            description="Most recent checks first."
            as="h2"
          />
          {checks.length === 0 ? (
            <p className="px-5 py-4 text-xs text-ink-600">
              No health checks recorded yet.
            </p>
          ) : (
            <Table
              caption="Recent provider health checks"
              head={
                <>
                  <Th>Connection</Th>
                  <Th>Result</Th>
                  <Th className="text-right">Latency</Th>
                  <Th>Detail</Th>
                  <Th>When</Th>
                </>
              }
            >
              {checks.map((check) => (
                <tr key={check.id}>
                  <Td className="text-xs">{check.connection.label}</Td>
                  <Td>
                    <HealthBadge state={check.state} />
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {check.latencyMs === null
                      ? '—'
                      : formatLatency(check.latencyMs)}
                  </Td>
                  <Td className="text-[11px] text-ink-400">
                    {check.detail ?? '—'}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-ink-400">
                    {formatRelative(check.checkedAt)}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
