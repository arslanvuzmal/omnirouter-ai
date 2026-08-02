import 'dotenv/config';

import { runCompletion } from '@/lib/ai/gateway';
import { prisma } from '@/lib/database/client';
import type { DemoBehaviour } from '@/lib/ai/types';

/**
 * Runs each failure mode through the real gateway and prints what the fallback
 * engine did.
 *
 * Useful as a live demonstration: it shows, in one screen, that each failure
 * category is handled according to its own policy rather than uniformly.
 */

const CASES: Array<{
  label: string;
  behaviour: DemoBehaviour;
  scope: 'all' | 'first_candidate';
  expectation: string;
}> = [
  {
    label: 'Provider timeout',
    behaviour: { forceTimeout: true },
    scope: 'first_candidate',
    expectation: 'one retry, then fallback to a different model',
  },
  {
    label: 'Rate limit (429)',
    behaviour: { forceRateLimit: true },
    scope: 'first_candidate',
    expectation: 'backed-off retry, then fallback',
  },
  {
    label: 'Provider unavailable (503)',
    behaviour: { forceUnavailable: true },
    scope: 'first_candidate',
    expectation: 'immediate fallback, no retry',
  },
  {
    label: 'Misconfigured credential (401)',
    behaviour: { forceAuthFailure: true },
    scope: 'first_candidate',
    expectation: 'no retry, fallback, connection flagged',
  },
  {
    label: 'Malformed response',
    behaviour: { forceMalformed: true },
    scope: 'first_candidate',
    expectation: 'one retry, then fallback',
  },
  {
    label: 'Safety refusal',
    behaviour: { forceSafetyRefusal: true },
    scope: 'all',
    expectation: 'returned to caller, never routed around',
  },
  {
    label: 'Context limit',
    behaviour: { forceContextLimit: true },
    scope: 'all',
    expectation: 'clear error, no silent truncation',
  },
  {
    label: 'Total outage',
    behaviour: { forceUnavailable: true },
    scope: 'all',
    expectation: 'every target tried, then a classified failure',
  },
];

async function main(): Promise<void> {
  if (process.env.DEMO_MODE === 'false') {
    throw new Error('Refusing to run: DEMO_MODE is false.');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: 'northwind-labs' },
    select: { id: true, isDemoWorkspace: true },
  });

  if (!workspace?.isDemoWorkspace) {
    throw new Error('Demo workspace not found. Run the seed first.');
  }

  const application = await prisma.application.findFirstOrThrow({
    where: { workspaceId: workspace.id, slug: 'support-copilot' },
    include: { environments: true },
  });

  const environment = application.environments.find((e) => e.type === 'DEVELOPMENT')!;

  const policy = await prisma.routingPolicy.findFirstOrThrow({
    where: { workspaceId: workspace.id, name: 'Balanced production' },
  });

  console.log('\nFailure simulation — each case run through the real gateway\n');
  console.log(
    `  ${'Case'.padEnd(30)} ${'Outcome'.padEnd(24)} ${'Attempts'.padEnd(9)} Path`,
  );
  console.log(`  ${'-'.repeat(94)}`);

  for (const testCase of CASES) {
    const result = await runCompletion({
      workspaceId: workspace.id,
      applicationId: application.id,
      environmentId: environment.id,
      environmentType: environment.type,
      apiKeyId: null,
      policyId: policy.id,
      messages: [{ role: 'user', content: `Simulating: ${testCase.label}` }],
      maxTokens: 200,
      demoBehaviour: testCase.behaviour,
      demoBehaviourScope: testCase.scope,
      source: 'failure-demo',
    });

    const outcome =
      result.status === 'SUCCEEDED'
        ? result.fallbackUsed
          ? 'recovered via fallback'
          : 'succeeded'
        : `failed (${result.errorCategory})`;

    const path = result.attempts
      .map((attempt) => `${attempt.modelLabel}:${attempt.status.toLowerCase()}`)
      .join(' → ');

    console.log(
      `  ${testCase.label.padEnd(30)} ${outcome.padEnd(24)} ${String(result.attempts.length).padEnd(9)} ${path}`,
    );
  }

  console.log('\n  Expectations:\n');
  for (const testCase of CASES) {
    console.log(`    ${testCase.label.padEnd(30)} ${testCase.expectation}`);
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('Failure simulation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
