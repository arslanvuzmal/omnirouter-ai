import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

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
import { STRATEGY_SUMMARIES } from '@/lib/ai/routing/descriptions';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';

export const metadata: Metadata = { title: 'Routing policies' };

export default async function RoutingPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const policies = await prisma.routingPolicy.findMany({
    where: { workspaceId },
    include: {
      rules: {
        include: { model: { select: { modelId: true, displayName: true } } },
        orderBy: { priority: 'asc' },
      },
      _count: { select: { requests: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Routing policies"
        description="A policy decides which model serves a request and in what order the alternatives are tried. Every decision it makes is recorded on the request."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {policies.length === 0 ? (
          <EmptyState
            title="No routing policies"
            description="A policy attaches models to a selection strategy and a fallback order."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {policies.map((policy) => (
              <Panel key={policy.id}>
                <PanelHeader
                  title={
                    <Link
                      href={`/dashboard/routing/${policy.id}`}
                      className="hover:text-primary-300"
                    >
                      {policy.name}
                    </Link>
                  }
                  description={policy.description ?? undefined}
                  actions={
                    <Link href={`/dashboard/routing/${policy.id}`}>
                      <span className="inline-flex items-center gap-1 text-xs text-primary-400 hover:underline">
                        Open
                        <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </Link>
                  }
                />

                <div className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="accent">{policy.strategy}</Badge>
                    <Badge tone={policy.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {policy.status.toLowerCase()}
                    </Badge>
                    <Badge tone="neutral">v{policy.version}</Badge>
                    <span className="text-[11px] text-ink-600">
                      {policy._count.requests} request
                      {policy._count.requests === 1 ? '' : 's'}
                    </span>
                  </div>

                  <p className="text-[11px] leading-relaxed text-ink-400">
                    {STRATEGY_SUMMARIES[policy.strategy]}
                  </p>

                  <div>
                    <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                      Targets, in fallback order
                    </h4>
                    <ol className="mt-1.5 space-y-1">
                      {policy.rules.map((rule, index) => (
                        <li
                          key={rule.id}
                          className="flex items-center gap-2 rounded border border-base-700 bg-base-850 px-2.5 py-1.5"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded bg-base-700 font-mono text-[9px] text-ink-300">
                            {index + 1}
                          </span>
                          <span className="flex-1 truncate font-mono text-[11px] text-ink-200">
                            {rule.model.modelId}
                          </span>
                          <span className="font-mono text-[10px] text-ink-600">
                            p{rule.priority} · w{rule.weight}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-ink-600">
                    <div className="flex gap-1">
                      <dt>Max attempts</dt>
                      <dd className="font-mono text-ink-400">{policy.maxAttempts}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Attempt timeout</dt>
                      <dd className="font-mono text-ink-400">
                        {policy.attemptTimeoutMs} ms
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Total timeout</dt>
                      <dd className="font-mono text-ink-400">
                        {policy.totalTimeoutMs} ms
                      </dd>
                    </div>
                  </dl>
                </div>
              </Panel>
            ))}
          </div>
        )}

        <Panel>
          <PanelHeader
            title="Selection strategies"
            description="Every strategy produces an explanation naming the candidates it considered and rejected."
            as="h2"
          />
          <Table
            caption="Available routing strategies"
            head={
              <>
                <Th>Strategy</Th>
                <Th>How it selects</Th>
              </>
            }
          >
            {Object.entries(STRATEGY_SUMMARIES).map(([strategy, summary]) => (
              <tr key={strategy}>
                <Td>
                  <Badge tone="accent">{strategy}</Badge>
                </Td>
                <Td className="text-xs leading-relaxed text-ink-400">{summary}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </PageBody>
    </>
  );
}
