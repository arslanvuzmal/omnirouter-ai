import { randomBytes } from 'node:crypto';

import { sha256 } from '@/lib/encryption/crypto';
import type { EnvironmentType, KeyStatus } from '@/lib/database/generated/enums';

/**
 * Virtual API keys.
 *
 * The plaintext key is returned exactly once, at creation. Only a SHA-256 hash
 * is persisted, so a database disclosure does not yield usable credentials.
 * A short prefix is stored separately for display, and is never sufficient to
 * authenticate on its own.
 *
 * Format: omr_<env>_<24 url-safe random characters>
 */

const PREFIX = 'omr';
const SECRET_BYTES = 18; // 24 base64url characters
const DISPLAY_PREFIX_LENGTH = 14;

export interface GeneratedKey {
  /** Full key. Shown once, never stored. */
  plaintext: string;
  /** SHA-256 of the full key. This is what is stored and matched against. */
  keyHash: string;
  /** Display-only fragment, e.g. "omr_dev_A1b2C3". */
  keyPrefix: string;
}

function environmentSegment(environment: EnvironmentType): string {
  return environment === 'PRODUCTION' ? 'live' : 'dev';
}

export function generateApiKey(environment: EnvironmentType): GeneratedKey {
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const plaintext = `${PREFIX}_${environmentSegment(environment)}_${secret}`;

  return {
    plaintext,
    keyHash: sha256(plaintext),
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/** Recomputes the lookup hash for a presented key. */
export function hashPresentedKey(plaintext: string): string {
  return sha256(plaintext);
}

/** Cheap structural check to reject obvious noise before touching the database. */
export function looksLikeApiKey(value: string): boolean {
  return /^omr_(dev|live)_[A-Za-z0-9_-]{20,}$/.test(value);
}

export function environmentFromKey(value: string): EnvironmentType | null {
  if (value.startsWith('omr_live_')) return 'PRODUCTION';
  if (value.startsWith('omr_dev_')) return 'DEVELOPMENT';
  return null;
}

/** Masked form for display in tables and logs. */
export function maskKey(keyPrefix: string): string {
  return `${keyPrefix}${'•'.repeat(12)}`;
}

export type KeyRejectionReason =
  | 'revoked'
  | 'expired'
  | 'missing_scope'
  | 'environment_mismatch';

export interface KeyValidationInput {
  status: KeyStatus;
  expiresAt: Date | null;
  scopes: string[];
  environmentType: EnvironmentType;
}

/**
 * Pure validation of a resolved key record. Returns null when the key is usable,
 * otherwise the first reason it was rejected.
 */
export function validateKeyRecord(
  key: KeyValidationInput,
  options: { requiredScope?: string; expectedEnvironment?: EnvironmentType } = {},
  now: Date = new Date(),
): KeyRejectionReason | null {
  if (key.status === 'REVOKED') return 'revoked';
  if (key.status === 'EXPIRED') return 'expired';
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return 'expired';

  if (
    options.expectedEnvironment &&
    key.environmentType !== options.expectedEnvironment
  ) {
    return 'environment_mismatch';
  }

  // An empty scope list means unrestricted; a populated list is an allowlist.
  if (
    options.requiredScope &&
    key.scopes.length > 0 &&
    !key.scopes.includes(options.requiredScope)
  ) {
    return 'missing_scope';
  }

  return null;
}

export const KEY_REJECTION_MESSAGES: Record<KeyRejectionReason, string> = {
  revoked: 'This API key has been revoked.',
  expired: 'This API key has expired.',
  missing_scope: 'This API key does not have the required scope.',
  environment_mismatch:
    'This API key belongs to a different environment than the one requested.',
};
