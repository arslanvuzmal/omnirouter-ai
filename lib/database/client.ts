import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/client';

/**
 * Prisma 7 connects through a driver adapter rather than the Rust engine, so the
 * connection URL is supplied here instead of in schema.prisma.
 *
 * The client is cached on globalThis because Next.js dev-mode hot reloading
 * re-evaluates modules on every change; without this, each reload would open a
 * new pool and exhaust Postgres connections.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and configure it.',
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  omnirouterPrisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.omnirouterPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.omnirouterPrisma = prisma;
}
