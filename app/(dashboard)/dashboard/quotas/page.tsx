import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  Badge,
  DemoDataNotice,
  EmptyState,
  Panel,
  PanelHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatCost } from '@/lib/ai/pricing';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { windowStart } from '@/lib/quotas/engine';
import { formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Quotas' };

const ACTION_TONE = {
  WARN: 'warning',
  REJECT: 'danger',
  ROUTE_LOWER_COST: 'accent',
} as const;

export default async function QuotasPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const quotas = await prisma.quota.findMany({
    where: { workspaceId },
    include: {
      application: { select: { name: true } },
      environment: { select: { type: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Consumption is computed the same way the enforcement path computes it, so
  // this screen cannot disagree with what the gateway actually does.
  const consumption = await Promise.all(
    quotas.map(async (quota) => {
      const aggregate = await prisma.request.aggregate({
        where: {
          workspaceId,
          ...(quota.applicationId ? { applicationId: quota.applicationId } : {}),
          ...(quota.environmentId ? { environmentId: quota.environmentId } : {}),
          createdAt: { gte: windowStart(quota.window) },
          status: { in: ['SUCCEEDED', 'FAILED'] },
        },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
      });

      return {
        requests: aggregate._count._all,
        tokens: aggregate._sum.totalTokens ?? 0,
        cost: Number(aggregate._sum.estimatedCost ?? 0),
      };
    }),
  );

  return (
    <>
      <PageHeader
        title="Quotas"
        description="Quotas are evaluated before a provider is contacted. A rejected request never consumes provider capacity."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <Panel>
          <PanelHeader title="Configured quotas" />
          {quotas.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No quotas configured"
                description="A quota caps requests, tokens or estimated cost over a minute, day or month."
              />
            </div>
          ) : (
            <Table
              caption="Quotas configured in this workspace"
              head={
                <>
                  <Th>Quota</Th>
                  <Th>Scope</Th>
                  <Th>Window</Th>
                  <Th>Limits</Th>
                  <Th>Consumption</Th>
                  <Th>On breach</Th>
                </>
              }
            >
              {quotas.map((quota, index) => {
                const used = consumption[index] ?? {
                  requests: 0,
                  tokens: 0,
                  cost: 0,
                };

                const ratios: number[] = [];
                if (quota.maxRequests) {
                  ratios.push(used.requests / quota.maxRequests);
                }
                if (quota.maxTokens) ratios.push(used.tokens / quota.maxTokens);
                if (quota.maxCost) {
                  ratios.push(used.cost / Number(quota.maxCost));
                }

                const peak = ratios.length > 0 ? Math.max(...ratios) : 0;
                const threshold = Number(quota.warnThreshold);

                return (
                  <tr key={quota.id}>
                    <Td>
                      <span className="block text-xs text-ink-50">{quota.name}</span>
                      {!quota.enabled ? <Badge tone="neutral">disabled</Badge> : null}
                    </Td>
                    <Td className="text-[11px] text-ink-400">
                      {quota.application?.name ?? 'Whole workspace'}
                      {quota.environment
                        ? ` · ${quota.environment.type.toLowerCase()}`
                        : ''}
                    </Td>
                    <Td>
                      <Badge tone="neutral">{quota.window.toLowerCase()}</Badge>
                    </Td>
                    <Td className="text-[11px] text-ink-400">
                      <div className="space-y-0.5">
                        {quota.maxRequests ? (
                          <div>{quota.maxRequests.toLocaleString()} requests</div>
                        ) : null}
                        {quota.maxTokens ? (
                          <div>{quota.maxTokens.toLocaleString()} tokens</div>
                        ) : null}
                        {quota.maxCost ? (
                          <div>{formatCost(Number(quota.maxCost))}</div>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <div className="min-w-28">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[11px] tabular-nums text-ink-200">
                            {formatPercent(Math.min(peak, 1), 0)}
                          </span>
                          <span className="font-mono text-[10px] text-ink-600">
                            {used.requests} req
                          </span>
                        </div>
                        <div
                          className="mt-1 h-1.5 overflow-hidden rounded-full bg-base-800"
                          aria-hidden="true"
                        >
                          <div
                            className={`h-full rounded-full ${
                              peak >= 1
                                ? 'bg-danger-400'
                                : peak >= threshold
                                  ? 'bg-warning-400'
                                  : 'bg-success-400'
                            }`}
                            style={{
                              width: `${Math.min(Math.max(peak * 100, 2), 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={ACTION_TONE[quota.action]}>
                        {quota.action.toLowerCase().replace(/_/g, ' ')}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
