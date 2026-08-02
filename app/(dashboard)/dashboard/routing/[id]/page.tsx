import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { HealthBadge } from '@/components/dashboard/status';
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
import { STRATEGY_SUMMARIES } from '@/lib/ai/routing/descriptions';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatLatency, formatPercent } from '@/lib/utils';

import { PolicyPreview } from './preview';

export const metadata: Metadata = { title: 'Routing policy' };

export default async function RoutingPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  const policy = await prisma.routingPolicy.findFirst({
    where: { id, workspaceId },
    include: {
      rules: {
        include: { model: { include: { connection: true } } },
        orderBy: { priority: 'asc' },
      },
      _count: { select: { requests: true } },
    },
  });

  if (!policy) notFound();

  // Recent outcomes per target, so the preview shows the same live signals the
  // engine actually scores on rather than static configuration.
  const attempts = await prisma.requestAttempt.groupBy({
    by: ['modelLabel', 'status'],
    where: { request: { workspaceId, policyId: policy.id } },
    _count: { _all: true },
    _avg: { latencyMs: true },
  });

  const signals = new Map<
    string,
    { successes: number; failures: number; latency: number; samples: number }
  >();

  for (const row of attempts) {
    const entry = signals.get(row.modelLabel) ?? {
      successes: 0,
      failures: 0,
      latency: 0,
      samples: 0,
    };

    if (row.status === 'SUCCEEDED') {
      entry.successes += row._count._all;
      entry.latency += (row._avg.latencyMs ?? 0) * row._count._all;
      entry.samples += row._count._all;
    } else if (row.status !== 'SKIPPED') {
      entry.failures += row._count._all;
    }

    signals.set(row.modelLabel, entry);
  }

  const targets = policy.rules.map((rule) => {
    const signal = signals.get(rule.model.modelId);
    const total = (signal?.successes ?? 0) + (signal?.failures ?? 0);

    return {
      id: rule.model.id,
      modelLabel: rule.model.modelId,
      displayName: rule.model.displayName,
      provider: rule.model.connection.kind,
      priority: rule.priority,
      weight: rule.weight,
      enabled: rule.enabled,
      contextWindow: rule.model.contextWindow,
      healthState: rule.model.healthState,
      inputPrice: Number(rule.model.inputPricePerMillion),
      outputPrice: Number(rule.model.outputPricePerMillion),
      capabilities: [
        rule.model.supportsStreaming ? 'streaming' : null,
        rule.model.supportsStructured ? 'structured' : null,
        rule.model.supportsVision ? 'vision' : null,
        rule.model.supportsToolUse ? 'tools' : null,
      ].filter((value): value is string => value !== null),
      recentLatencyMs:
        signal && signal.samples > 0 ? signal.latency / signal.samples : null,
      recentSuccessRate: total > 0 ? (signal?.successes ?? 0) / total : null,
      samples: total,
    };
  });

  return (
    <>
      <PageHeader
        title={policy.name}
        description={policy.description ?? undefined}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{policy.strategy}</Badge>
            <Badge tone={policy.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {policy.status.toLowerCase()}
            </Badge>
            <Badge tone="neutral">v{policy.version}</Badge>
          </div>
        }
        actions={
          <Link href="/dashboard/routing">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All policies
            </Button>
          </Link>
        }
      />

      <PageBody>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Targets" value={policy.rules.length} />
          <Stat label="Max attempts" value={policy.maxAttempts} />
          <Stat
            label="Attempt timeout"
            value={`${(policy.attemptTimeoutMs / 1000).toFixed(0)} s`}
          />
          <Stat label="Requests routed" value={policy._count.requests} />
        </dl>

        <Panel>
          <PanelHeader
            title="Selection strategy"
            description={STRATEGY_SUMMARIES[policy.strategy]}
          />
        </Panel>

        <Panel>
          <PanelHeader
            title="Candidate evaluation"
            description="The live signals this policy scores on. Ordering here reflects configured priority; the preview below shows what the engine would actually choose."
          />
          <Table
            caption="Candidate models attached to this policy"
            head={
              <>
                <Th>Model</Th>
                <Th>Provider</Th>
                <Th className="text-right">Priority</Th>
                <Th className="text-right">Weight</Th>
                <Th>Health</Th>
                <Th className="text-right">Recent latency</Th>
                <Th className="text-right">Success rate</Th>
                <Th className="text-right">Cost / 1M</Th>
                <Th>Capabilities</Th>
              </>
            }
          >
            {targets.map((target) => (
              <tr key={target.id}>
                <Td>
                  <span className="block font-mono text-xs text-ink-50">
                    {target.modelLabel}
                  </span>
                  <span className="block text-[10px] text-ink-600">
                    {target.contextWindow.toLocaleString()} ctx
                  </span>
                </Td>
                <Td>
                  <Badge tone="neutral">{target.provider}</Badge>
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {target.priority}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {target.weight}
                </Td>
                <Td>
                  <HealthBadge state={target.healthState} />
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {target.recentLatencyMs === null
                    ? '—'
                    : formatLatency(target.recentLatencyMs)}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums">
                  {target.recentSuccessRate === null ? (
                    <span className="text-ink-600">no samples</span>
                  ) : (
                    formatPercent(target.recentSuccessRate, 0)
                  )}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                  {formatCost(target.inputPrice)} / {formatCost(target.outputPrice)}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {target.capabilities.map((capability) => (
                      <Badge key={capability} tone="neutral">
                        {capability}
                      </Badge>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>

        <PolicyPreview policyId={policy.id} strategy={policy.strategy} />
      </PageBody>
    </>
  );
}
