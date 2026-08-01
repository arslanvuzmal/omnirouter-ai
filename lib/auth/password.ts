import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

/**
 * Password hashing using scrypt.
 *
 * scrypt is memory-hard and ships in the Node standard library, so there is no
 * native compilation step — which matters for CI and for Vercel's build image.
 *
 * Stored format: scrypt$N$r$p$base64(salt)$base64(hash)
 * Embedding the parameters means existing hashes stay verifiable if the cost
 * factors are raised later.
 */

/**
 * promisify() cannot express scrypt's options overload, so the wrapper is
 * written by hand to keep the cost parameters typed.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const PARAMS = { N: 16384, r: 8, p: 1, keyLength: 64 } as const;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 128 * PARAMS.N * PARAMS.r * 2,
  });

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');

  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] as string, 'base64');
  const expected = Buffer.from(parts[5] as string, 'base64');

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  try {
    const derived = await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });

    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

/** Minimum policy enforced at registration. Returns a list of failures. */
export function validatePasswordStrength(password: string): string[] {
  const problems: string[] = [];

  if (password.length < 10) {
    problems.push('Use at least 10 characters.');
  }
  if (!/[a-z]/.test(password)) {
    problems.push('Include a lowercase letter.');
  }
  if (!/[A-Z]/.test(password)) {
    problems.push('Include an uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    problems.push('Include a digit.');
  }

  return problems;
}
