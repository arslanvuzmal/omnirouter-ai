import { z } from 'zod';

/**
 * Server environment contract.
 *
 * Validated lazily rather than at module load so that `next build` can
 * statically render pages without a database connection present.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z
    .string()
    .refine((value) => {
      try {
        return Buffer.from(value, 'base64').length === 32;
      } catch {
        return false;
      }
    }, 'ENCRYPTION_KEY must be exactly 32 bytes, base64-encoded'),
  INTERNAL_API_SECRET: z.string().min(16).optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DEMO_MODE: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  DEMO_PASSWORD: z.string().min(8).default('OmniDemo!2026'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    // Report which variables failed without ever echoing their values.
    const fields = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server environment — ${fields}`);
  }

  cached = parsed.data;
  return cached;
}

/** Demo mode is readable on the client through this public flag. */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== 'false';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
