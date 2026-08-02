import { WorkspaceRole } from '@/lib/database/generated/enums';

/**
 * Server-side authorisation.
 *
 * Every permission below is checked on the server before an action runs.
 * Hiding a button in the UI is presentation, not enforcement — the two are kept
 * deliberately separate so a hidden control cannot be reached by crafting a
 * direct request.
 */

export const PERMISSIONS = [
  // Workspace
  'workspace:read',
  'workspace:update',
  'workspace:delete',
  'workspace:transfer_ownership',
  // Members
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  // Applications
  'application:read',
  'application:create',
  'application:update',
  'application:archive',
  // Provider connections and credentials
  'provider:read',
  'provider:create',
  'provider:update',
  'provider:delete',
  'provider:test',
  // Models
  'model:read',
  'model:update',
  // Routing
  'policy:read',
  'policy:create',
  'policy:update',
  'policy:activate',
  'policy:test',
  // API keys
  'apikey:read',
  'apikey:create_development',
  'apikey:create_production',
  'apikey:revoke',
  // Prompts
  'prompt:read',
  'prompt:create',
  'prompt:update',
  'prompt:rollback',
  // Playground
  'playground:execute',
  // Requests and analytics
  'request:read',
  'analytics:read',
  'analytics:export',
  // Quotas
  'quota:read',
  'quota:manage',
  // Audit
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  'workspace:read',
  'member:read',
  'application:read',
  'provider:read',
  'model:read',
  'policy:read',
  'prompt:read',
  'request:read',
  'analytics:read',
  'quota:read',
  'apikey:read',
];

const ANALYST: Permission[] = [...VIEWER, 'analytics:export'];

const DEVELOPER: Permission[] = [
  ...VIEWER,
  'policy:test',
  'playground:execute',
  'prompt:create',
  'prompt:update',
  'prompt:rollback',
  'apikey:create_development',
];

const ADMIN: Permission[] = [
  ...DEVELOPER,
  'analytics:export',
  'workspace:update',
  'member:invite',
  'member:update_role',
  'member:remove',
  'application:create',
  'application:update',
  'application:archive',
  'provider:create',
  'provider:update',
  'provider:delete',
  'provider:test',
  'model:update',
  'policy:create',
  'policy:update',
  'policy:activate',
  'apikey:create_production',
  'apikey:revoke',
  'quota:manage',
  'audit:read',
];

const OWNER: Permission[] = [
  ...ADMIN,
  'workspace:delete',
  'workspace:transfer_ownership',
];

const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  DEVELOPER: new Set(DEVELOPER),
  ANALYST: new Set(ANALYST),
  VIEWER: new Set(VIEWER),
};

export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: WorkspaceRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]].sort();
}

/** Thrown when a caller lacks the required permission. Maps to HTTP 403. */
export class PermissionDeniedError extends Error {
  readonly permission: Permission;
  readonly role: WorkspaceRole;

  constructor(role: WorkspaceRole, permission: Permission) {
    super(`Role ${role} does not permit ${permission}.`);
    this.name = 'PermissionDeniedError';
    this.role = role;
    this.permission = permission;
  }
}

export function assertPermission(role: WorkspaceRole, permission: Permission): void {
  if (!roleHasPermission(role, permission)) {
    throw new PermissionDeniedError(role, permission);
  }
}

/** Ranking used to prevent privilege escalation when changing a member's role. */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  ANALYST: 2,
  DEVELOPER: 3,
  ADMIN: 4,
  OWNER: 5,
};

/**
 * A member may only assign a role strictly below their own. This stops an ADMIN
 * from minting another OWNER, or from promoting themselves.
 */
export function canAssignRole(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole,
): boolean {
  if (actorRole === 'OWNER') return true;
  return ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

export function roleRank(role: WorkspaceRole): number {
  return ROLE_RANK[role];
}
