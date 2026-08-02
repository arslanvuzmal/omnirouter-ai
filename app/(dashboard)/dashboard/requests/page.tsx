import type { Metadata } from 'next';
import Link from 'next/link';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  EnvironmentBadge,
  ErrorBadge,
  FallbackBadge,
  RequestStatusBadge,
} from '@/components/dashboard/status';
import {
  Badge,
  DemoDataNotice,
  EmptyState,
  Panel,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatCost } from '@/lib/ai/pricing';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import type {
  ErrorCategory,
  RequestStatus,
} from '@/lib/database/generated/enums';
import { formatLatency, formatRelative } from '@/lib/utils';

import { RequestFilters } from './filters';

export const metadata: Metadata = { title: 'Requests' };

const PAGE_SIZE = 40;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceId, membership } = await requireWorkspace();
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = first('status');
  const category = first('category');
  const applicationId = first('application');
  const environment = first('environment');
  const fallbackOnly = first('fallback') === 'true';

  // Filters are validated against the enum rather than trusted, and every query
  // is scoped by workspaceId so a crafted parameter cannot cross tenants.
  const where = {
    workspaceId,
    ...(status && ['SUCCEEDED', 'FAILED', 'REJECTED'].includes(status)
      ? { status: status as RequestStatus }
      : {}),
    ...(category ? { errorCategory: category as ErrorCategory } : {}),
    ...(applicationId ? { applicationId } : {}),
    ...(environment ? { environment: { type: environment as 'DEVELOPMENT' | 'PRODUCTION' } } : {}),
    ...(fallbackOnly ? { fallbackUsed: true } : {}),
  };

  const [requests, total, applications] = await Promise.all([
    prisma.request.findMany({
      where,
      select: {
        id: true,
        correlationId: true,
        status: true,
        errorCategory: true,
        resolvedModel: true,
        fallbackUsed: true,
        attemptCount: true,
        totalTokens: true,
        estimatedCost: true,
        totalLatencyMs: true,
        createdAt: true,
        application: { select: { name: true } },
        environment: { select: { type: true } },
        policy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    }),
    prisma.request.count({ where }),
    prisma.application.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Requests"
        description="Every request through the gateway, with the provider attempts it made. Open one to see the full trace."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <RequestFilters applications={applications} />

        <Panel>
          <div className="flex items-center justify-between border-b border-base-700 px-5 py-3">
            <p className="text-xs text-ink-400">
              {total.toLocaleString()} request{total === 1 ? '' : 's'} match
              {total === 1 ? 'es' : ''} these filters
              {total > PAGE_SIZE ? ` · showing the most recent ${PAGE_SIZE}` : ''}
            </p>
          </div>

          {requests.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No matching requests"
                description="Adjust the filters, or send a request through the playground to produce one."
              />
            </div>
          ) : (
            <Table
              caption="Requests matching the current filters"
              head={
                <>
                  <Th>Status</Th>
                  <Th>Application</Th>
                  <Th>Model</Th>
                  <Th>Policy</Th>
                  <Th className="text-right">Attempts</Th>
                  <Th className="text-right">Latency</Th>
                  <Th className="text-right">Tokens</Th>
                  <Th className="text-right">Cost</Th>
                  <Th>When</Th>
                </>
              }
            >
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="cursor-pointer transition-colors hover:bg-base-850/60"
                >
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
                    <Link href={`/dashboard/requests/${request.id}`}>
                      <span className="block text-xs text-ink-200">
                        {request.application.name}
                      </span>
                      <span className="mt-0.5 block">
                        <EnvironmentBadge type={request.environment.type} />
                      </span>
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">
                    {request.resolvedModel ?? '—'}
                  </Td>
                  <Td className="text-xs text-ink-400">
                    {request.policy?.name ?? '—'}
                  </Td>
                  <Td className="text-right">
                    {request.attemptCount > 1 ? (
                      <Badge tone="warning">{request.attemptCount}</Badge>
                    ) : (
                      <span className="font-mono text-xs tabular-nums text-ink-400">
                        {request.attemptCount}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {formatLatency(request.totalLatencyMs)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                    {request.totalTokens.toLocaleString()}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {formatCost(Number(request.estimatedCost))}
                  </Td>
                  <Td className="text-xs whitespace-nowrap text-ink-400">
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
