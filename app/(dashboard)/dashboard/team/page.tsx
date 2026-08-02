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
import type { WorkspaceRole } from '@/lib/database/generated/enums';
import { permissionsForRole } from '@/lib/permissions/rbac';
import { formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Team' };

const ROLE_ORDER: WorkspaceRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'ANALYST', 'VIEWER'];

const ROLE_SUMMARY: Record<WorkspaceRole, string> = {
  OWNER: 'Everything an admin can do, plus workspace deletion and ownership transfer.',
  ADMIN:
    'Applications, providers, policies, production keys, quotas, members and audit access.',
  DEVELOPER: 'Playground, prompts, development keys, request logs and policy testing.',
  ANALYST: 'Analytics, request metadata and exports. No credential access.',
  VIEWER: 'Read-only. Cannot create secrets or change configuration.',
};

export default async function TeamPage() {
  const { workspaceId, membership, session } = await requireWorkspace();

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Team"
        description="Roles are enforced on the server for every action. Hiding a control in the interface is presentation, not access control."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        <Panel>
          <PanelHeader title="Members" />
          <Table
            caption="Members of this workspace"
            head={
              <>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th className="text-right">Permissions</Th>
                <Th>Last signed in</Th>
              </>
            }
          >
            {members.map((member) => (
              <tr key={member.id}>
                <Td className="text-xs text-ink-50">
                  {member.user.name}
                  {member.user.id === session.user.id ? (
                    <span className="ml-1.5 text-[10px] text-ink-600">(you)</span>
                  ) : null}
                </Td>
                <Td className="font-mono text-[11px] text-ink-400">
                  {member.user.email}
                </Td>
                <Td>
                  <Badge
                    tone={
                      member.role === 'OWNER' || member.role === 'ADMIN'
                        ? 'primary'
                        : member.role === 'VIEWER'
                          ? 'neutral'
                          : 'accent'
                    }
                  >
                    {member.role}
                  </Badge>
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                  {permissionsForRole(member.role).length}
                </Td>
                <Td className="text-xs text-ink-400">
                  {member.user.lastLoginAt
                    ? formatRelative(member.user.lastLoginAt)
                    : 'never'}
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel>
          <PanelHeader
            title="Role model"
            description="A member can only assign a role strictly below their own, which prevents an admin from minting another owner or promoting themselves."
            as="h2"
          />
          <Table
            caption="Workspace roles and what they permit"
            head={
              <>
                <Th>Role</Th>
                <Th>Grants</Th>
                <Th className="text-right">Permissions</Th>
              </>
            }
          >
            {ROLE_ORDER.map((role) => (
              <tr key={role}>
                <Td>
                  <Badge
                    tone={
                      role === 'OWNER' || role === 'ADMIN'
                        ? 'primary'
                        : role === 'VIEWER'
                          ? 'neutral'
                          : 'accent'
                    }
                  >
                    {role}
                  </Badge>
                </Td>
                <Td className="text-xs leading-relaxed text-ink-400">
                  {ROLE_SUMMARY[role]}
                </Td>
                <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                  {permissionsForRole(role).length}
                </Td>
              </tr>
            ))}
          </Table>
        </Panel>
      </PageBody>
    </>
  );
}
