import 'dotenv/config';

import { prisma } from '@/lib/database/client';

/**
 * Clears the demo workspace and re-seeds it.
 *
 * Scoped by slug and guarded on isDemoWorkspace, so it can only ever remove
 * seeded demonstration data. It refuses to run when DEMO_MODE is disabled.
 */

const DEMO_SLUG = 'northwind-labs';

async function main(): Promise<void> {
  if (process.env.DEMO_MODE === 'false') {
    throw new Error('Refusing to reset: DEMO_MODE is false.');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: DEMO_SLUG },
    select: { id: true, name: true, isDemoWorkspace: true },
  });

  if (!workspace) {
    console.log(`No workspace with slug "${DEMO_SLUG}". Nothing to reset.`);
    return;
  }

  if (!workspace.isDemoWorkspace) {
    throw new Error(
      `Refusing to reset "${workspace.name}": it is not flagged as a demo workspace.`,
    );
  }

  // Cascades remove applications, environments, policies, keys, requests,
  // attempts, usage, quotas, health checks, audit entries and scenarios.
  await prisma.workspace.delete({ where: { id: workspace.id } });
  console.log(`Removed demo workspace "${workspace.name}".`);

  // Demo accounts are workspace-independent, so they are cleared explicitly.
  const { count } = await prisma.user.deleteMany({
    where: { isDemoAccount: true },
  });
  console.log(`Removed ${count} demo accounts.`);

  console.log(
    '\nRun `npm run demo:seed` (or `npx tsx prisma/seed/index.ts`) to rebuild.',
  );
}

main()
  .catch((error) => {
    console.error('Reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
