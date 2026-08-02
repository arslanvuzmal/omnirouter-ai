/**
 * State redaction for audit records.
 *
 * Deliberately dependency-free: redaction is pure logic and must be testable —
 * and reusable — without opening a database connection.
 */

/** Keys whose values are replaced before any state snapshot is persisted. */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'apikey',
  'api_key',
  'keyhash',
  'plaintext',
  'credential',
  'credentialciphertext',
  'secret',
  'token',
  'tokenhash',
  'authorization',
  'databaseurl',
  'database_url',
  'encryptionkey',
]);

const REDACTED = '[redacted]';

/** Depth cap prevents a cyclic or pathological structure from hanging a write. */
const MAX_DEPTH = 6;

export function redactState(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((entry) => redactState(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redactState(entry, depth + 1);
    }

    return output;
  }

  return value;
}

export { SENSITIVE_KEYS, REDACTED };
