import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved connection URLs out of schema.prisma and into this file.
 *
 * DATABASE_URL is the pooled connection used by the application at runtime.
 * DIRECT_URL is the unpooled connection Prisma Migrate needs; on Supabase the
 * pooler cannot run DDL, so migrations must bypass it.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: env('DIRECT_URL') ?? env('DATABASE_URL'),
  },
});
