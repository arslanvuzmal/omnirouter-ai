import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  Badge,
  DemoDataNotice,
  Panel,
  PanelHeader,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import type { ContentLoggingMode } from '@/lib/database/generated/enums';
import { formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Settings' };

const LOGGING_MODES: Array<{
  mode: ContentLoggingMode;
  label: string;
  detail: string;
}> = [
  {
    mode: 'METADATA_ONLY',
    label: 'Metadata only',
    detail:
      'Records counts, timings, cost, routing decisions and error categories. No prompt or response body is stored. This is the default.',
  },
  {
    mode: 'REDACTED',
    label: 'Redacted',
    detail:
      'Stores a truncated preview with detected sensitive patterns masked. Useful for debugging shape without retaining content.',
  },
  {
    mode: 'FULL_CONTENT',
    label: 'Full content',
    detail:
      'Stores complete prompts and responses. Requires an explicit opt-in because it changes what personal data the deployment retains.',
  },
];

export default async function SettingsPage() {
  const { workspaceId, membership, role } = await requireWorkspace();

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    include: {
      _count: {
        select: { applications: true, members: true, requests: true, apiKeys: true },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace configuration and data-retention posture."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <Panel>
          <PanelHeader title="Workspace" />
          <Table
            caption="Workspace details"
            head={
              <>
                <Th>Property</Th>
                <Th>Value</Th>
              </>
            }
          >
            <tr>
              <Td className="text-xs text-ink-400">Name</Td>
              <Td className="text-xs text-ink-50">{workspace.name}</Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Slug</Td>
              <Td className="font-mono text-xs text-ink-200">{workspace.slug}</Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Your role</Td>
              <Td>
                <Badge tone="primary">{role}</Badge>
              </Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Applications</Td>
              <Td className="font-mono text-xs text-ink-200">
                {workspace._count.applications}
              </Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Members</Td>
              <Td className="font-mono text-xs text-ink-200">
                {workspace._count.members}
              </Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Requests recorded</Td>
              <Td className="font-mono text-xs text-ink-200">
                {workspace._count.requests}
              </Td>
            </tr>
            <tr>
              <Td className="text-xs text-ink-400">Created</Td>
              <Td className="text-xs text-ink-200">
                {formatDateTime(workspace.createdAt)}
              </Td>
            </tr>
          </Table>
        </Panel>

        {workspace.isProtected ? (
          <div className="flex items-start gap-3 rounded-lg border border-warning-400/25 bg-warning-400/8 px-4 py-3">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-400"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-warning-400">
              This workspace is protected. Destructive operations are disabled
              because it is shared demonstration data that other visitors depend
              on. The restriction is enforced server-side, not by hiding
              controls.
            </p>
          </div>
        ) : null}

        <Panel>
          <PanelHeader
            title="Content logging"
            description="Determines whether prompt and response bodies are retained alongside request metadata."
            as="h2"
          />
          <div className="space-y-2.5 px-5 py-4">
            {LOGGING_MODES.map((option) => {
              const active = workspace.contentLoggingMode === option.mode;

              return (
                <div
                  key={option.mode}
                  className={`rounded-lg border px-3.5 py-3 ${
                    active
                      ? 'border-primary-500/40 bg-primary-500/8'
                      : 'border-base-700 bg-base-850'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink-50">
                      {option.label}
                    </span>
                    {active ? <Badge tone="primary">current</Badge> : null}
                    {option.mode === 'FULL_CONTENT' ? (
                      <Badge tone="warning">requires explicit opt-in</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
                    {option.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
