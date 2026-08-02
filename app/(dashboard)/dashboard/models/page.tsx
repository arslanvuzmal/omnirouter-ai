import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { HealthBadge } from '@/components/dashboard/status';
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
import { DEMO_MODEL_DISCLAIMER } from '@/lib/ai/providers/demo';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';

export const metadata: Metadata = { title: 'Models' };

export default async function ModelsPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const models = await prisma.modelDefinition.findMany({
    where: { workspaceId },
    include: {
      connection: { select: { kind: true, label: true } },
      _count: { select: { rules: true } },
    },
    orderBy: [{ isDemoModel: 'desc' }, { displayName: 'asc' }],
  });

  const hasDemoModels = models.some((model) => model.isDemoModel);

  return (
    <>
      <PageHeader
        title="Models"
        description="The workspace catalogue. Capabilities and pricing recorded here are what the routing engine filters and scores on."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {hasDemoModels ? (
          <div className="rounded-lg border border-warning-400/25 bg-warning-400/8 px-4 py-3">
            <p className="text-xs leading-relaxed text-warning-400">
              <strong className="font-semibold">{DEMO_MODEL_DISCLAIMER}.</strong>{' '}
              Astra Fast, Astra Pro, Nimbus Reasoning and Local Ember are
              fictional models that run in-process. They are not proxies for, and
              make no claim about, any real commercial model. Their prices and
              latencies are simulated.
            </p>
          </div>
        ) : null}

        <Panel>
          <PanelHeader title="Model catalogue" />
          {models.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No models catalogued"
                description="Connect a provider to populate the catalogue."
              />
            </div>
          ) : (
            <Table
              caption="Models available in this workspace"
              head={
                <>
                  <Th>Model</Th>
                  <Th>Provider</Th>
                  <Th className="text-right">Context</Th>
                  <Th>Capabilities</Th>
                  <Th className="text-right">Input / 1M</Th>
                  <Th className="text-right">Output / 1M</Th>
                  <Th>Health</Th>
                  <Th className="text-right">Policies</Th>
                </>
              }
            >
              {models.map((model) => (
                <tr key={model.id}>
                  <Td>
                    <span className="block text-xs text-ink-50">
                      {model.displayName}
                    </span>
                    <span className="block font-mono text-[10px] text-ink-600">
                      {model.modelId}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={model.isDemoModel ? 'primary' : 'neutral'}>
                      {model.connection.kind}
                    </Badge>
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {model.contextWindow.toLocaleString()}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {model.supportsStreaming ? (
                        <Badge tone="neutral">stream</Badge>
                      ) : null}
                      {model.supportsStructured ? (
                        <Badge tone="neutral">structured</Badge>
                      ) : null}
                      {model.supportsVision ? (
                        <Badge tone="neutral">vision</Badge>
                      ) : null}
                      {model.supportsToolUse ? (
                        <Badge tone="neutral">tools</Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                    ${Number(model.inputPricePerMillion).toFixed(2)}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                    ${Number(model.outputPricePerMillion).toFixed(2)}
                  </Td>
                  <Td>
                    <HealthBadge state={model.healthState} />
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {model._count.rules}
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
