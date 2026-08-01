import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Symmetric encryption for stored provider credentials.
 *
 * AES-256-GCM is used because it authenticates as well as encrypts: a tampered
 * ciphertext fails to decrypt rather than silently yielding wrong plaintext.
 *
 * Stored format: base64(iv) : base64(authTag) : base64(ciphertext)
 * A random 12-byte IV per encryption means identical plaintexts never produce
 * identical ciphertexts.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function resolveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32',
    );
  }

  const key = Buffer.from(raw, 'base64');

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes, got ${key.length}.`,
    );
  }

  return key;
}

export function encryptSecret(plaintext: string): string {
  if (plaintext.length === 0) {
    throw new Error('Cannot encrypt an empty value.');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, resolveKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext: expected iv:tag:data.');
  }

  const [ivPart, tagPart, dataPart] = parts as [string, string, string];

  const decipher = createDecipheriv(
    ALGORITHM,
    resolveKey(),
    Buffer.from(ivPart, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Non-reversible digest used for API keys, session tokens and IP addresses. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison; prevents timing oracles on secret comparison. */
export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Hashes an IP address with the server secret so audit records can correlate
 * activity from one source without storing the address itself.
 */
export function hashIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return sha256(`${ip}:${process.env.AUTH_SECRET ?? 'omnirouter'}`).slice(0, 32);
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
