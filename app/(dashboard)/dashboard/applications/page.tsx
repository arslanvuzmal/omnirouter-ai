import type { Metadata } from 'next';
import Link from 'next/link';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { EnvironmentBadge } from '@/components/dashboard/status';
import {
  Badge,
  DemoDataNotice,
  EmptyState,
  Panel,
  PanelHeader,
} from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';

export const metadata: Metadata = { title: 'Applications' };

export default async function ApplicationsPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const applications = await prisma.application.findMany({
    where: { workspaceId },
    include: {
      environments: {
        include: { defaultPolicy: { select: { name: true, strategy: true } } },
        orderBy: { type: 'asc' },
      },
      _count: { select: { requests: true, apiKeys: true } },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Applications"
        description="Each application is an isolated consumer of the gateway, with its own environments, keys and default routing policy."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {applications.length === 0 ? (
          <EmptyState
            title="No applications"
            description="An application represents one product or service that calls the gateway."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {applications.map((application) => (
              <Panel key={application.id}>
                <PanelHeader
                  title={
                    <Link
                      href={`/dashboard/applications/${application.id}`}
                      className="hover:text-primary-300"
                    >
                      {application.name}
                    </Link>
                  }
                  description={application.description ?? undefined}
                  actions={
                    application.archivedAt ? (
                      <Badge tone="neutral">archived</Badge>
                    ) : (
                      <Badge tone="success">active</Badge>
                    )
                  }
                />

                <div className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap gap-3 text-[11px] text-ink-400">
                    <span>
                      <span className="font-mono text-ink-200">
                        {application._count.requests}
                      </span>{' '}
                      requests
                    </span>
                    <span>
                      <span className="font-mono text-ink-200">
                        {application._count.apiKeys}
                      </span>{' '}
                      API keys
                    </span>
                    <span className="font-mono text-ink-600">
                      {application.slug}
                    </span>
                  </div>

                  <ul className="space-y-1.5">
                    {application.environments.map((environment) => (
                      <li
                        key={environment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-base-700 bg-base-850 px-2.5 py-2"
                      >
                        <EnvironmentBadge type={environment.type} />
                        <span className="text-[11px] text-ink-400">
                          {environment.defaultPolicy
                            ? `${environment.defaultPolicy.name} · ${environment.defaultPolicy.strategy}`
                            : 'No default policy'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
