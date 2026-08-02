import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { EnvironmentBadge } from '@/components/dashboard/status';
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
import { maskKey } from '@/lib/api-keys/keys';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatDateTime, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'API keys' };

export default async function ApiKeysPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const keys = await prisma.virtualAPIKey.findMany({
    where: { workspaceId },
    include: {
      application: { select: { name: true } },
      environment: { select: { type: true } },
      _count: { select: { requests: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <>
      <PageHeader
        title="API keys"
        description="Virtual keys scope access to one application and one environment. They can be revoked instantly without touching a provider credential."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <div className="flex items-start gap-3 rounded-lg border border-primary-500/25 bg-primary-500/8 px-4 py-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-primary-400"
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-ink-200">
            Only a SHA-256 hash of each key is stored. The full value is shown once at
            creation and cannot be recovered afterwards — not by an owner, not from the
            database, and not from this screen. The prefix below is for identification
            only and cannot authenticate a request.
          </p>
        </div>

        <Panel>
          <PanelHeader title="Issued keys" />
          {keys.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No API keys"
                description="Issue a key to let an application call the gateway."
              />
            </div>
          ) : (
            <Table
              caption="Virtual API keys issued in this workspace"
              head={
                <>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Application</Th>
                  <Th>Environment</Th>
                  <Th>Scopes</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Requests</Th>
                  <Th>Last used</Th>
                </>
              }
            >
              {keys.map((key) => (
                <tr key={key.id}>
                  <Td className="text-xs text-ink-50">{key.name}</Td>
                  <Td className="font-mono text-[11px] text-ink-400">
                    {maskKey(key.keyPrefix)}
                  </Td>
                  <Td className="text-xs">{key.application.name}</Td>
                  <Td>
                    <EnvironmentBadge type={key.environment.type} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {key.scopes.length === 0 ? (
                        <span className="text-[10px] text-ink-600">unrestricted</span>
                      ) : (
                        key.scopes.map((scope) => (
                          <Badge key={scope} tone="neutral">
                            {scope}
                          </Badge>
                        ))
                      )}
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        key.status === 'ACTIVE'
                          ? 'success'
                          : key.status === 'REVOKED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {key.status.toLowerCase()}
                    </Badge>
                    {key.revokedAt ? (
                      <span className="mt-0.5 block text-[10px] text-ink-600">
                        {formatDateTime(key.revokedAt)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-right font-mono text-xs tabular-nums">
                    {key._count.requests}
                  </Td>
                  <Td className="text-xs text-ink-400">
                    {key.lastUsedAt ? formatRelative(key.lastUsedAt) : 'never'}
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
