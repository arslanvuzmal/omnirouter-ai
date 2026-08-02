import 'dotenv/config';

import { afterAll, beforeAll } from 'vitest';

import { prisma } from '@/lib/database/client';

/**
 * Integration and security tests run against a real PostgreSQL database.
 *
 * Fixtures are namespaced with a per-run prefix and removed afterwards, so a
 * test run never disturbs seeded demonstration data sharing the same database.
 */

export const TEST_PREFIX = `test-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Start the database with `npm run db:up`.');
  }

  // Fail fast with a clear message rather than a connection error per test.
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  // Workspace cascades remove applications, environments, policies, keys,
  // requests, attempts, usage, quotas, audit entries and scenarios.
  await prisma.workspace.deleteMany({
    where: { slug: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: TEST_PREFIX } },
  });

  await prisma.$disconnect();
});
