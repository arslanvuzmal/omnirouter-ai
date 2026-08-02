import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { DemoDataNotice, EmptyState } from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { can } from '@/lib/auth/guard';

import { PlaygroundClient } from './playground-client';

export const metadata: Metadata = { title: 'Playground' };

export default async function PlaygroundPage() {
  const { workspaceId, role, membership } = await requireWorkspace();

  const [applications, policies] = await Promise.all([
    prisma.application.findMany({
      where: { workspaceId, archivedAt: null },
      select: {
        id: true,
        name: true,
        environments: { select: { id: true, type: true }, orderBy: { type: 'asc' } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.routingPolicy.findMany({
      where: { workspaceId, status: 'ACTIVE' },
      select: { id: true, name: true, strategy: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Playground"
        description="Send a request through the gateway, inspect the route it chose, and simulate a provider failure to watch the fallback engine react."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {applications.length === 0 ? (
          <EmptyState
            title="No applications yet"
            description="The playground runs requests on behalf of an application, so create one first."
          />
        ) : (
          <PlaygroundClient
            applications={applications}
            policies={policies}
            canExecute={can(role, 'playground:execute')}
          />
        )}
      </PageBody>
    </>
  );
}
