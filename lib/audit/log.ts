import { prisma } from '@/lib/database/client';

import { redactState } from './redact';

/**
 * Append-only audit log.
 *
 * There is deliberately no update or delete helper in this module. An audit
 * trail that can be edited by the application it audits is not evidence.
 *
 * Recorded state is redacted before storage so a credential rotation cannot
 * leave the old secret sitting in the audit table.
 */

export type AuditAction =
  | 'workspace.created'
  | 'workspace.updated'
  | 'workspace.logging_mode_changed'
  | 'member.invited'
  | 'member.role_changed'
  | 'member.removed'
  | 'application.created'
  | 'application.updated'
  | 'application.archived'
  | 'provider.connected'
  | 'provider.updated'
  | 'provider.deleted'
  | 'provider.credential_rotated'
  | 'provider.health_checked'
  | 'model.updated'
  | 'policy.created'
  | 'policy.updated'
  | 'policy.activated'
  | 'apikey.created'
  | 'apikey.revoked'
  | 'prompt.created'
  | 'prompt.version_created'
  | 'prompt.rolled_back'
  | 'quota.created'
  | 'quota.updated'
  | 'quota.exceeded'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.registered';

// Redaction lives in ./redact so it can be tested and reused without opening a
// database connection.
export { redactState };

export interface AuditInput {
  workspaceId: string;
  actorId: string | null;
  actorLabel: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  correlationId?: string | null;
  ipHash?: string | null;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      actorLabel: input.actorLabel,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      previousState:
        input.previousState === undefined
          ? undefined
          : (redactState(input.previousState) as object),
      newState:
        input.newState === undefined
          ? undefined
          : (redactState(input.newState) as object),
      correlationId: input.correlationId ?? null,
      ipHash: input.ipHash ?? null,
    },
  });
}

/**
 * Audit writes must never break the operation they describe, but a silent
 * failure would be worse. Failures are surfaced on the server console and the
 * caller continues.
 */
export async function recordAuditSafely(input: AuditInput): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    console.error('[audit] failed to record entry', {
      action: input.action,
      workspaceId: input.workspaceId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Human-readable label for each action, used by the audit table. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'workspace.created': 'Workspace created',
  'workspace.updated': 'Workspace settings updated',
  'workspace.logging_mode_changed': 'Content logging mode changed',
  'member.invited': 'Member invited',
  'member.role_changed': 'Member role changed',
  'member.removed': 'Member removed',
  'application.created': 'Application created',
  'application.updated': 'Application updated',
  'application.archived': 'Application archived',
  'provider.connected': 'Provider connected',
  'provider.updated': 'Provider connection updated',
  'provider.deleted': 'Provider connection deleted',
  'provider.credential_rotated': 'Provider credential rotated',
  'provider.health_checked': 'Provider health checked',
  'model.updated': 'Model configuration updated',
  'policy.created': 'Routing policy created',
  'policy.updated': 'Routing policy updated',
  'policy.activated': 'Routing policy activated',
  'apikey.created': 'API key created',
  'apikey.revoked': 'API key revoked',
  'prompt.created': 'Prompt created',
  'prompt.version_created': 'Prompt version created',
  'prompt.rolled_back': 'Prompt rolled back',
  'quota.created': 'Quota created',
  'quota.updated': 'Quota updated',
  'quota.exceeded': 'Quota exceeded',
  'auth.login_succeeded': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'auth.registered': 'Account registered',
};
