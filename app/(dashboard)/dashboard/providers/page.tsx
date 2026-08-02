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
import { listProviders } from '@/lib/ai/providers';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Providers' };

export default async function ProvidersPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const connections = await prisma.providerConnection.findMany({
    where: { workspaceId },
    include: { _count: { select: { models: true } } },
    orderBy: { label: 'asc' },
  });

  const adapters = listProviders();

  return (
    <>
      <PageHeader
        title="Providers"
        description="Connections hold encrypted credentials. The credential itself is never returned to the browser, and never appears in a log or an audit record."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <Panel>
          <PanelHeader
            title="Connected providers"
            description="Credentials are encrypted at rest with AES-256-GCM."
          />
          {connections.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No provider connections"
                description="Connect a provider to make its models available for routing."
              />
            </div>
          ) : (
            <Table
              caption="Provider connections in this workspace"
              head={
                <>
                  <Th>Connection</Th>
                  <Th>Kind</Th>
                  <Th>Credential</Th>
                  <Th>Status</Th>
                  <Th>Health</Th>
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
                    {connection.credentialCiphertext ? (
                      <Badge tone="success">encrypted</Badge>
                    ) : (
                      <span className="text-[11px] text-ink-600">
                        none required
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        connection.status === 'ACTIVE'
                          ? 'success'
                          : connection.status === 'MISCONFIGURED'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {connection.status.toLowerCase()}
                    </Badge>
                  </Td>
                  <Td>
                    <HealthBadge state={connection.healthState} />
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
            title="Available adapters"
            description="Each adapter normalises its provider into the platform's request and response envelope. Adapters requiring a credential are production-ready but need a key to activate."
            as="h2"
          />
          <Table
            caption="Provider adapters implemented in this platform"
            head={
              <>
                <Th>Adapter</Th>
                <Th>Kind</Th>
                <Th>Credential</Th>
                <Th>Notes</Th>
              </>
            }
          >
            {adapters.map((adapter) => (
              <tr key={adapter.kind}>
                <Td className="text-xs text-ink-50">{adapter.displayName}</Td>
                <Td>
                  <Badge tone={adapter.kind === 'DEMO' ? 'primary' : 'neutral'}>
                    {adapter.kind}
                  </Badge>
                </Td>
                <Td>
                  {adapter.requiresCredential ? (
                    <Badge tone="warning">required</Badge>
                  ) : (
                    <Badge tone="success">not required</Badge>
                  )}
                </Td>
                <Td className="text-[11px] leading-relaxed text-ink-400">
                  {adapter.kind === 'DEMO'
                    ? 'Runs in-process with deterministic output. No network request leaves the deployment.'
                    : adapter.kind === 'OLLAMA'
                      ? 'Self-hosted; addressed by base URL rather than an API key.'
                      : 'Implemented against the published API contract; supply a credential to activate.'}
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </PageBody>
    </>
  );
}
