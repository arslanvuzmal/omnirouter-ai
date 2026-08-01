import 'server-only';

import { redirect } from 'next/navigation';

import type { WorkspaceRole } from '@/lib/database/generated/enums';
import type { Permission } from '@/lib/permissions/rbac';
import { PermissionDeniedError, roleHasPermission } from '@/lib/permissions/rbac';

import type { AuthenticatedSession, SessionMembership } from './session';
import { getSession } from './session';

/**
 * Server-side access guards.
 *
 * Every dashboard page and every mutation routes through one of these. The
 * membership is always re-read from the database rather than taken from a
 * client-supplied workspace id, which is what makes cross-workspace access
 * impossible to reach by editing a URL.
 */

export class WorkspaceAccessError extends Error {
  constructor(workspaceId: string) {
    super(`No accessible membership for workspace ${workspaceId}.`);
    this.name = 'WorkspaceAccessError';
  }
}

export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export interface WorkspaceContext {
  session: AuthenticatedSession;
  membership: SessionMembership;
  workspaceId: string;
  role: WorkspaceRole;
}

/**
 * Resolves the active workspace.
 *
 * When no id is supplied the first membership is used, which makes the common
 * single-workspace case work without a selector.
 */
export async function requireWorkspace(
  workspaceId?: string,
): Promise<WorkspaceContext> {
  const session = await requireSession();

  if (session.memberships.length === 0) {
    redirect('/onboarding');
  }

  const membership = workspaceId
    ? session.memberships.find((entry) => entry.workspaceId === workspaceId)
    : session.memberships[0];

  if (!membership) {
    // Deliberately identical to "not found": revealing that a workspace exists
    // but is inaccessible would leak the existence of other tenants.
    throw new WorkspaceAccessError(workspaceId ?? 'unknown');
  }

  return {
    session,
    membership,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export async function requirePermission(
  permission: Permission,
  workspaceId?: string,
): Promise<WorkspaceContext> {
  const context = await requireWorkspace(workspaceId);

  if (!roleHasPermission(context.role, permission)) {
    throw new PermissionDeniedError(context.role, permission);
  }

  return context;
}

/** Non-throwing variant for conditionally rendering UI affordances. */
export function can(role: WorkspaceRole, permission: Permission): boolean {
  return roleHasPermission(role, permission);
}

/**
 * Blocks destructive operations against a protected workspace.
 *
 * The public portfolio deployment marks its demo workspace protected so a
 * visitor cannot delete the data every other visitor depends on.
 */
export class ProtectedWorkspaceError extends Error {
  constructor(action: string) {
    super(
      `${action} is disabled on this workspace because it is protected for shared demonstration use.`,
    );
    this.name = 'ProtectedWorkspaceError';
  }
}

export function assertNotProtected(
  membership: SessionMembership,
  action: string,
): void {
  if (membership.isProtected) {
    throw new ProtectedWorkspaceError(action);
  }
}
