import { Lock } from 'lucide-react';
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
import { AUDIT_ACTION_LABELS, type AuditAction } from '@/lib/audit/log';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatDateTime, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Audit log' };

function labelFor(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

export default async function AuditPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const entries = await prisma.auditLog.findMany({
    where: { workspaceId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="An append-only record of administrative changes. Sensitive values are redacted before an entry is written."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <div className="flex items-start gap-3 rounded-lg border border-base-700 bg-base-900/60 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-ink-400">
            The application has no code path that updates or deletes an audit entry.
            Credentials, key hashes and connection strings are replaced with{' '}
            <code className="font-mono text-ink-200">[redacted]</code> before a state
            snapshot is stored, so rotating a secret cannot leave the old value behind in
            this table.
          </p>
        </div>

        <Panel>
          <PanelHeader
            title="Recent activity"
            description={`Showing the most recent ${entries.length} entries.`}
          />
          {entries.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No audit entries"
                description="Administrative changes will appear here as they happen."
              />
            </div>
          ) : (
            <Table
              caption="Audit log entries for this workspace"
              head={
                <>
                  <Th>Action</Th>
                  <Th>Actor</Th>
                  <Th>Resource</Th>
                  <Th>Detail</Th>
                  <Th>When</Th>
                </>
              }
            >
              {entries.map((entry) => {
                const state = entry.newState as { detail?: string } | null;

                return (
                  <tr key={entry.id}>
                    <Td className="text-xs text-ink-50">{labelFor(entry.action)}</Td>
                    <Td className="text-[11px] text-ink-400">
                      {entry.actor?.name ?? entry.actorLabel}
                    </Td>
                    <Td>
                      <Badge tone="neutral">
                        {entry.resourceType.replace(/_/g, ' ')}
                      </Badge>
                    </Td>
                    <Td className="text-[11px] text-ink-400">{state?.detail ?? '—'}</Td>
                    <Td
                      className="text-xs whitespace-nowrap text-ink-400"
                      title={formatDateTime(entry.createdAt)}
                    >
                      {formatRelative(entry.createdAt)}
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
