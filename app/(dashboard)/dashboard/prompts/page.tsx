import type { Metadata } from 'next';
import Link from 'next/link';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  Badge,
  DemoDataNotice,
  EmptyState,
  Panel,
  PanelHeader,
} from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Prompts' };

export default async function PromptsPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const prompts = await prisma.prompt.findMany({
    where: { workspaceId },
    include: {
      activeVersion: { select: { version: true, changeNote: true } },
      _count: { select: { versions: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Prompts"
        description="Versions are immutable and an active pointer selects which one is live. Editing a prompt in place would destroy the ability to explain a past result."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {prompts.length === 0 ? (
          <EmptyState
            title="No prompts"
            description="The registry stores versioned system prompts and user templates with declared variables."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {prompts.map((prompt) => (
              <Panel key={prompt.id}>
                <PanelHeader
                  title={
                    <Link
                      href={`/dashboard/prompts/${prompt.id}`}
                      className="hover:text-primary-300"
                    >
                      {prompt.name}
                    </Link>
                  }
                  description={prompt.description ?? undefined}
                />
                <div className="space-y-2.5 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="primary">
                      v{prompt.activeVersion?.version ?? '—'} active
                    </Badge>
                    <Badge tone="neutral">
                      {prompt._count.versions} version
                      {prompt._count.versions === 1 ? '' : 's'}
                    </Badge>
                    <span className="text-[11px] text-ink-600">
                      updated {formatRelative(prompt.updatedAt)}
                    </span>
                  </div>
                  {prompt.activeVersion?.changeNote ? (
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      {prompt.activeVersion.changeNote}
                    </p>
                  ) : null}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
