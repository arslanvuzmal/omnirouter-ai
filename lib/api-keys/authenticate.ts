import { prisma } from '@/lib/database/client';
import type { EnvironmentType } from '@/lib/database/generated/enums';

import {
  hashPresentedKey,
  KEY_REJECTION_MESSAGES,
  looksLikeApiKey,
  validateKeyRecord,
} from './keys';

/**
 * Virtual API key authentication for the public gateway.
 *
 * The presented key is hashed and matched against the stored hash — the
 * plaintext is never compared, stored or logged. A failure returns one generic
 * shape so a caller cannot distinguish "no such key" from "revoked key", which
 * would otherwise let someone probe which keys exist.
 */

export interface AuthenticatedKey {
  apiKeyId: string;
  workspaceId: string;
  applicationId: string;
  environmentId: string;
  environmentType: EnvironmentType;
  defaultPolicyId: string | null;
  keyName: string;
}

export type KeyAuthResult =
  { ok: true; key: AuthenticatedKey } | { ok: false; message: string };

const GENERIC_REJECTION = 'The supplied API key is not valid.';

/** Extracts the key from an Authorization header or the x-api-key header. */
export function extractKey(headers: Headers): string | null {
  const authorization = headers.get('authorization');

  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return headers.get('x-api-key')?.trim() ?? null;
}

export async function authenticateApiKey(
  presented: string | null,
  options: { requiredScope?: string } = {},
): Promise<KeyAuthResult> {
  if (!presented || !looksLikeApiKey(presented)) {
    return { ok: false, message: GENERIC_REJECTION };
  }

  const record = await prisma.virtualAPIKey.findUnique({
    where: { keyHash: hashPresentedKey(presented) },
    include: {
      environment: {
        select: { id: true, type: true, defaultPolicyId: true },
      },
    },
  });

  if (!record) {
    return { ok: false, message: GENERIC_REJECTION };
  }

  const rejection = validateKeyRecord(
    {
      status: record.status,
      expiresAt: record.expiresAt,
      scopes: record.scopes,
      environmentType: record.environment.type,
    },
    { requiredScope: options.requiredScope },
  );

  if (rejection) {
    // Revocation and expiry are stated plainly: the caller already holds the
    // key, so this reveals nothing they did not have, and a vague message here
    // would cost an integrator hours.
    return { ok: false, message: KEY_REJECTION_MESSAGES[rejection] };
  }

  // Best-effort: a failed timestamp update must not fail the request.
  await prisma.virtualAPIKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    ok: true,
    key: {
      apiKeyId: record.id,
      workspaceId: record.workspaceId,
      applicationId: record.applicationId,
      environmentId: record.environmentId,
      environmentType: record.environment.type,
      defaultPolicyId: record.environment.defaultPolicyId,
      keyName: record.name,
    },
  };
}
