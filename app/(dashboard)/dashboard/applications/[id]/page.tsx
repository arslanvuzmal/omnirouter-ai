import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  EnvironmentBadge,
  ErrorBadge,
  FallbackBadge,
  RequestStatusBadge,
} from '@/components/dashboard/status';
import {
  Badge,
  Button,
  Panel,
  PanelHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatCost } from '@/lib/ai/pricing';
import { getOverviewMetrics } from '@/lib/analytics/queries';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatLatency, formatPercent, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Application' };

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  const application = await prisma.application.findFirst({
    where: { id, workspaceId },
    include: {
      environments: {
        include: { defaultPolicy: { select: { id: true, name: true, strategy: true } } },
        orderBy: { type: 'asc' },
      },
      apiKeys: {
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          status: true,
          lastUsedAt: true,
          environment: { select: { type: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!application) notFound();

  const [metrics, recent] = await Promise.all([
    getOverviewMetrics({ workspaceId, applicationId: application.id, days: 30 }),
    prisma.request.findMany({
      where: { workspaceId, applicationId: application.id },
      select: {
        id: true,
        status: true,
        errorCategory: true,
        resolvedModel: true,
        fallbackUsed: true,
        totalLatencyMs: true,
        estimatedCost: true,
        createdAt: true,
        environment: { select: { type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return (
    <>
      <PageHeader
        title={application.name}
        description={application.description ?? undefined}
        meta={<span className="font-mono text-xs text-ink-600">{application.slug}</span>}
        actions={
          <Link href="/dashboard/applications">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All applications
            </Button>
          </Link>
        }
      />

      <PageBody>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Requests" value={metrics.totalRequests} hint="Last 30 days" />
          <Stat
            label="Success rate"
            value={formatPercent(metrics.successRate)}
            tone={metrics.successRate >= 0.95 ? 'success' : 'warning'}
          />
          <Stat label="P95 latency" value={formatLatency(metrics.p95LatencyMs)} />
          <Stat label="Estimated cost" value={formatCost(metrics.estimatedCost)} />
        </dl>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="Environments"
              description="Development and production are isolated: a key issued for one cannot address the other."
            />
            <div className="space-y-2 px-5 py-4">
              {application.environments.map((environment) => (
                <div
                  key={environment.id}
                  className="rounded-lg border border-base-700 bg-base-850 px-3.5 py-3"
                >
                  <EnvironmentBadge type={environment.type} />
                  <p className="mt-2 text-[11px] text-ink-400">
                    Default policy:{' '}
                    {environment.defaultPolicy ? (
                      <Link
                        href={`/dashboard/routing/${environment.defaultPolicy.id}`}
                        className="text-primary-400 hover:underline"
                      >
                        {environment.defaultPolicy.name}
                      </Link>
                    ) : (
                      <span className="text-ink-600">none configured</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="API keys"
              description="Only the hash is stored; the plaintext was shown once at creation."
            />
            {application.apiKeys.length === 0 ? (
              <p className="px-5 py-4 text-xs text-ink-600">No keys issued.</p>
            ) : (
              <Table
                caption="API keys for this application"
                head={
                  <>
                    <Th>Name</Th>
                    <Th>Prefix</Th>
                    <Th>Environment</Th>
                    <Th>Status</Th>
                  </>
                }
              >
                {application.apiKeys.map((key) => (
                  <tr key={key.id}>
                    <Td className="text-xs">{key.name}</Td>
                    <Td className="font-mono text-[11px] text-ink-400">
                      {key.keyPrefix}…
                    </Td>
                    <Td>
                      <EnvironmentBadge type={key.environment.type} />
                    </Td>
                    <Td>
                      <Badge tone={key.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {key.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Recent requests" />
          {recent.length === 0 ? (
            <p className="px-5 py-4 text-xs text-ink-600">
              No requests from this application yet.
            </p>
          ) : (
            <Table
              caption="Recent requests from this application"
              head={
                <>
                  <Th>Status</Th>
                  <Th>Environment</Th>
                  <Th>Model</Th>
                  <Th className="text-right">Latency</Th>
                  <Th className="text-right">Cost</Th>
                  <Th>When</Th>
                </>
              }
            >
              {recent.map((request) => (
                <tr key={request.id} className="hover:bg-base-850/60">
                  <Td>
                    <Link
                      href={`/dashboard/requests/${request.id}`}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <RequestStatusBadge status={request.status} />
                      <FallbackBadge used={request.fallbackUsed} />
                      {request.errorCategory ? (
                        <ErrorBadge category={request.errorCategory} />
                      ) : null}
                    </Link>
                  </Td>
                  <Td>
                    <EnvironmentBadge type={request.environment.type} />
                  </Td>
                  <Td className="font-mono text-xs">{request.resolvedModel ?? '—'}</Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {formatLatency(request.totalLatencyMs)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {formatCost(Number(request.estimatedCost))}
                  </Td>
                  <Td className="text-xs text-ink-400">
                    {formatRelative(request.createdAt)}
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
