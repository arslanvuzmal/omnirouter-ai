import { beforeAll, describe, expect, it } from 'vitest';

import {
  environmentFromKey,
  generateApiKey,
  hashPresentedKey,
  looksLikeApiKey,
  maskKey,
  validateKeyRecord,
} from '@/lib/api-keys/keys';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '@/lib/auth/password';
import { redactState } from '@/lib/audit/redact';
import {
  decryptSecret,
  encryptSecret,
  hashIpAddress,
  safeCompare,
  sha256,
} from '@/lib/encryption/crypto';
import {
  canAssignRole,
  permissionsForRole,
  roleHasPermission,
} from '@/lib/permissions/rbac';

beforeAll(() => {
  // A deterministic 32-byte key so encryption tests do not depend on .env.
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.AUTH_SECRET = 'test-auth-secret-value-at-least-32-chars';
});

describe('encryption', () => {
  it('round-trips a secret', () => {
    const plaintext = 'sk-provider-credential-value';
    expect(decryptSecret(encryptSecret(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertext for identical plaintext', () => {
    // A fresh random IV per encryption; otherwise identical credentials would
    // be identifiable as identical from the database alone.
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('refuses to decrypt tampered ciphertext', () => {
    const encrypted = encryptSecret('sensitive');
    const [iv, tag, data] = encrypted.split(':') as [string, string, string];
    const tamperedData = Buffer.from(data, 'base64');
    tamperedData[0] = (tamperedData[0] ?? 0) ^ 0xff;

    expect(() =>
      decryptSecret(`${iv}:${tag}:${tamperedData.toString('base64')}`),
    ).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow(/Malformed/);
  });

  it('rejects an encryption key of the wrong length', () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
    process.env.ENCRYPTION_KEY = original;
  });

  it('compares in constant time and rejects unequal lengths', () => {
    expect(safeCompare('abc', 'abc')).toBe(true);
    expect(safeCompare('abc', 'abd')).toBe(false);
    expect(safeCompare('abc', 'abcd')).toBe(false);
  });

  it('hashes an IP address rather than storing it', () => {
    const hashed = hashIpAddress('203.0.113.5');
    expect(hashed).not.toBeNull();
    expect(hashed).not.toContain('203.0.113.5');
    expect(hashed).toHaveLength(32);
    expect(hashIpAddress(null)).toBeNull();
  });

  it('produces a stable sha256 hex digest', () => {
    expect(sha256('omnirouter')).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256('omnirouter')).toBe(sha256('omnirouter'));
  });
});

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('CorrectHorse42');
    await expect(verifyPassword('CorrectHorse42', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('CorrectHorse42');
    await expect(verifyPassword('WrongHorse42', hash)).resolves.toBe(false);
  });

  it('never stores the plaintext', async () => {
    const hash = await hashPassword('CorrectHorse42');
    expect(hash).not.toContain('CorrectHorse42');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so identical passwords produce different hashes', async () => {
    const a = await hashPassword('CorrectHorse42');
    const b = await hashPassword('CorrectHorse42');
    expect(a).not.toBe(b);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    await expect(verifyPassword('x', 'garbage')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$a$b$c$d$e')).resolves.toBe(false);
  });

  it('reports every unmet strength requirement', () => {
    // Fails all four: too short, no lower case, no upper case, no digit.
    expect(validatePasswordStrength('!!!!')).toHaveLength(4);
    // Fails three: too short, no upper case, no digit.
    expect(validatePasswordStrength('short')).toHaveLength(3);
    expect(validatePasswordStrength('LongEnough1')).toHaveLength(0);
  });
});

describe('virtual API keys', () => {
  it('embeds the environment in the key', () => {
    expect(generateApiKey('PRODUCTION').plaintext.startsWith('omr_live_')).toBe(true);
    expect(generateApiKey('DEVELOPMENT').plaintext.startsWith('omr_dev_')).toBe(true);
  });

  it('stores only a hash, and the prefix cannot authenticate', () => {
    const generated = generateApiKey('DEVELOPMENT');

    expect(generated.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.keyHash).not.toContain(generated.plaintext);
    expect(generated.plaintext).not.toBe(generated.keyPrefix);
    expect(hashPresentedKey(generated.keyPrefix)).not.toBe(generated.keyHash);
  });

  it('matches only the exact plaintext', () => {
    const generated = generateApiKey('DEVELOPMENT');
    expect(hashPresentedKey(generated.plaintext)).toBe(generated.keyHash);
    expect(hashPresentedKey(`${generated.plaintext}x`)).not.toBe(generated.keyHash);
  });

  it('generates a unique key each time', () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateApiKey('DEVELOPMENT').plaintext),
    );
    expect(keys.size).toBe(50);
  });

  it('recognises well-formed keys and rejects noise', () => {
    expect(looksLikeApiKey(generateApiKey('PRODUCTION').plaintext)).toBe(true);
    expect(looksLikeApiKey('sk-openai-style-key')).toBe(false);
    expect(looksLikeApiKey('omr_dev_short')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
  });

  it('derives the environment from the key prefix', () => {
    expect(environmentFromKey('omr_live_abc')).toBe('PRODUCTION');
    expect(environmentFromKey('omr_dev_abc')).toBe('DEVELOPMENT');
    expect(environmentFromKey('nonsense')).toBeNull();
  });

  it('masks a key for display', () => {
    expect(maskKey('omr_dev_A1b2C3')).toContain('•');
  });
});

describe('API key validation', () => {
  const base = {
    status: 'ACTIVE' as const,
    expiresAt: null,
    scopes: [] as string[],
    environmentType: 'DEVELOPMENT' as const,
  };

  it('accepts an active unrestricted key', () => {
    expect(validateKeyRecord(base)).toBeNull();
  });

  it('rejects a revoked key', () => {
    expect(validateKeyRecord({ ...base, status: 'REVOKED' })).toBe('revoked');
  });

  it('rejects a key past its expiry', () => {
    expect(validateKeyRecord({ ...base, expiresAt: new Date(Date.now() - 1000) })).toBe(
      'expired',
    );
  });

  it('accepts a key that has not yet expired', () => {
    expect(
      validateKeyRecord({ ...base, expiresAt: new Date(Date.now() + 60_000) }),
    ).toBeNull();
  });

  it('treats an empty scope list as unrestricted', () => {
    expect(validateKeyRecord(base, { requiredScope: 'chat.completions' })).toBeNull();
  });

  it('enforces a populated scope list as an allowlist', () => {
    expect(
      validateKeyRecord(
        { ...base, scopes: ['embeddings'] },
        { requiredScope: 'chat.completions' },
      ),
    ).toBe('missing_scope');
  });

  it('rejects a key issued for a different environment', () => {
    expect(validateKeyRecord(base, { expectedEnvironment: 'PRODUCTION' })).toBe(
      'environment_mismatch',
    );
  });
});

describe('role permissions', () => {
  it('grants an owner every permission an admin has', () => {
    for (const permission of permissionsForRole('ADMIN')) {
      expect(roleHasPermission('OWNER', permission)).toBe(true);
    }
  });

  it('denies a viewer any write permission', () => {
    expect(roleHasPermission('VIEWER', 'playground:execute')).toBe(false);
    expect(roleHasPermission('VIEWER', 'apikey:create_development')).toBe(false);
    expect(roleHasPermission('VIEWER', 'policy:create')).toBe(false);
    expect(roleHasPermission('VIEWER', 'workspace:delete')).toBe(false);
  });

  it('denies an analyst access to credentials or secrets', () => {
    expect(roleHasPermission('ANALYST', 'provider:create')).toBe(false);
    expect(roleHasPermission('ANALYST', 'apikey:create_production')).toBe(false);
    expect(roleHasPermission('ANALYST', 'analytics:export')).toBe(true);
  });

  it('lets a developer create development keys but not production keys', () => {
    expect(roleHasPermission('DEVELOPER', 'apikey:create_development')).toBe(true);
    expect(roleHasPermission('DEVELOPER', 'apikey:create_production')).toBe(false);
  });

  it('reserves workspace deletion for the owner alone', () => {
    expect(roleHasPermission('OWNER', 'workspace:delete')).toBe(true);
    expect(roleHasPermission('ADMIN', 'workspace:delete')).toBe(false);
  });

  it('prevents privilege escalation through role assignment', () => {
    // An admin cannot mint another owner, nor promote a peer to admin.
    expect(canAssignRole('ADMIN', 'OWNER')).toBe(false);
    expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'DEVELOPER')).toBe(true);
    expect(canAssignRole('OWNER', 'ADMIN')).toBe(true);
    expect(canAssignRole('DEVELOPER', 'ADMIN')).toBe(false);
  });
});

describe('audit redaction', () => {
  it('replaces sensitive values at any depth', () => {
    const redacted = redactState({
      name: 'Production key',
      apiKey: 'omr_live_secret',
      nested: { credentialCiphertext: 'iv:tag:data', keep: 'visible' },
      list: [{ password: 'hunter2' }],
    }) as Record<string, unknown>;

    expect(redacted.name).toBe('Production key');
    expect(redacted.apiKey).toBe('[redacted]');
    expect((redacted.nested as Record<string, unknown>).credentialCiphertext).toBe(
      '[redacted]',
    );
    expect((redacted.nested as Record<string, unknown>).keep).toBe('visible');
    expect(((redacted.list as unknown[])[0] as Record<string, unknown>).password).toBe(
      '[redacted]',
    );
  });

  it('is case-insensitive on key names', () => {
    const redacted = redactState({ APIKey: 'x', Secret: 'y' }) as Record<string, unknown>;
    expect(redacted.APIKey).toBe('[redacted]');
    expect(redacted.Secret).toBe('[redacted]');
  });

  it('handles null and primitives without throwing', () => {
    expect(redactState(null)).toBeNull();
    expect(redactState(42)).toBe(42);
    expect(redactState('text')).toBe('text');
  });
});
