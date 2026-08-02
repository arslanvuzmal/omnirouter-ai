import 'dotenv/config';

import { prisma } from '@/lib/database/client';
import { DEMO_SCENARIOS } from '@/prisma/seed/scenarios';

/**
 * Verifies that the seeded demonstration data matches what each scenario claims.
 *
 * This is what keeps the demo honest: if a change to the routing or fallback
 * engine alters an outcome, this fails rather than letting the dashboard show a
 * story the code no longer produces.
 */

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
}

async function main(): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: 'northwind-labs' },
  });

  if (!workspace) {
    console.error('Demo workspace not found. Run the seed first.');
    process.exitCode = 1;
    return;
  }

  // --- Structural expectations -------------------------------------------
  const [users, applications, policies, models, keys, quotas, prompts] =
    await Promise.all([
      prisma.user.count({ where: { isDemoAccount: true } }),
      prisma.application.count({ where: { workspaceId: workspace.id } }),
      prisma.routingPolicy.count({ where: { workspaceId: workspace.id } }),
      prisma.modelDefinition.count({ where: { workspaceId: workspace.id } }),
      prisma.virtualAPIKey.count({ where: { workspaceId: workspace.id } }),
      prisma.quota.count({ where: { workspaceId: workspace.id } }),
      prisma.prompt.count({ where: { workspaceId: workspace.id } }),
    ]);

  record('demo accounts', users === 4, `${users} of 4`);
  record('applications', applications === 2, `${applications} of 2`);
  record('routing policies', policies === 5, `${policies} of 5`);
  record('demo models', models === 4, `${models} of 4`);
  record('virtual api keys', keys === 5, `${keys} of 5`);
  record('quotas', quotas === 2, `${quotas} of 2`);
  record('prompts', prompts === 1, `${prompts} of 1`);

  // --- Secrets are never stored in plaintext ------------------------------
  const keyRows = await prisma.virtualAPIKey.findMany({
    where: { workspaceId: workspace.id },
    select: { keyHash: true, keyPrefix: true },
  });

  const hashesLookRight = keyRows.every(
    (row) => /^[a-f0-9]{64}$/.test(row.keyHash) && row.keyPrefix.length <= 20,
  );
  record('api keys stored as sha-256', hashesLookRight, `${keyRows.length} keys checked`);

  const plaintextLeak = keyRows.some((row) => row.keyHash.startsWith('omr_'));
  record('no plaintext key stored', !plaintextLeak, 'keyHash never holds a raw key');

  // --- Scenario outcomes --------------------------------------------------
  const requests = await prisma.request.findMany({
    where: { workspaceId: workspace.id, source: 'seed' },
    include: { attempts: { orderBy: { sequence: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  record(
    'seeded requests',
    requests.length === DEMO_SCENARIOS.length,
    `${requests.length} of ${DEMO_SCENARIOS.length}`,
  );

  const succeeded = requests.filter((r) => r.status === 'SUCCEEDED').length;
  const withFallback = requests.filter((r) => r.fallbackUsed).length;
  const failed = requests.filter((r) => r.status !== 'SUCCEEDED').length;

  record(
    'fallback demonstrated',
    withFallback >= 4,
    `${withFallback} requests recovered on a different model`,
  );
  record(
    'failure demonstrated',
    failed >= 2,
    `${failed} requests ended in a terminal, classified failure`,
  );
  record('success demonstrated', succeeded >= 12, `${succeeded} succeeded`);

  // Every request must carry a stored routing explanation and a trace.
  const missingExplanation = requests.filter((r) => !r.routeExplanation).length;
  record(
    'route explanation stored',
    missingExplanation === 0,
    `${requests.length - missingExplanation} of ${requests.length} requests`,
  );

  const missingTrace = requests.filter((r) => !r.traceStages).length;
  record(
    'trace stages stored',
    missingTrace === 0,
    `${requests.length - missingTrace} of ${requests.length} requests`,
  );

  // Multi-attempt requests must record every attempt, not just the last.
  const multiAttempt = requests.filter((r) => r.attemptCount > 1);
  const attemptsConsistent = multiAttempt.every(
    (r) => r.attempts.length === r.attemptCount,
  );
  record(
    'attempt history complete',
    attemptsConsistent,
    `${multiAttempt.length} multi-attempt requests`,
  );

  // Safety refusals must not have been retried against another provider.
  const refusals = requests.filter((r) => r.errorCategory === 'SAFETY_REFUSAL');
  const refusalsNotShopped = refusals.every((r) => r.attempts.length === 1);
  record(
    'safety refusal not bypassed',
    refusalsNotShopped,
    `${refusals.length} refusal(s), each stopped after one attempt`,
  );

  // --- Content logging ----------------------------------------------------
  const contentLeak = await prisma.request.count({
    where: {
      workspaceId: workspace.id,
      OR: [{ promptPreview: { not: null } }, { responsePreview: { not: null } }],
    },
  });
  record(
    'metadata-only logging honoured',
    contentLeak === 0,
    'no prompt or response body persisted',
  );

  // --- Report -------------------------------------------------------------
  const failedChecks = checks.filter((check) => !check.passed);

  console.log('\nDemo verification\n');
  for (const check of checks) {
    console.log(
      `  ${check.passed ? 'PASS' : 'FAIL'}  ${check.name.padEnd(32)} ${check.detail}`,
    );
  }

  console.log(
    `\n${checks.length - failedChecks.length}/${checks.length} checks passed.\n`,
  );

  if (failedChecks.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
