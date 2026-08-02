import 'dotenv/config';

import { runCompletion } from '@/lib/ai/gateway';
import { prisma } from '@/lib/database/client';
import type { DemoBehaviour } from '@/lib/ai/types';

/**
 * Generates demonstration traffic spread across recent days.
 *
 * Every request is executed through the real gateway, so the rows, attempts,
 * routing explanations and traces are genuine output from the production code
 * path. Only `createdAt` is adjusted afterwards, to place the request on an
 * earlier day — a workspace with a month of history is what makes the analytics
 * screens meaningful, and generating that history in real time is not practical.
 *
 * The backdating is disclosed here and in the seeded workspace's "Demo data"
 * indicator. Nothing about the request itself is fabricated.
 */

const DAYS = 30;
const PROMPTS = [
  'Summarise this support thread and suggest the next action.',
  'Classify this ticket as billing, technical, or account access.',
  'Draft a one-sentence acknowledgement for this customer.',
  'Rewrite this reply in a warmer tone.',
  'Extract the key dates and amounts from this message.',
  'Produce a status update for the customer.',
  'Explain our refund policy in two sentences.',
  'Categorise this batch of incoming messages.',
];

/** Weekday traffic is heavier; weekends are quieter. A flat line looks fake. */
function requestsForDay(dayOffset: number, random: () => number): number {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - dayOffset);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const base = weekend ? 2 : 5;
  return base + Math.floor(random() * (weekend ? 3 : 6));
}

/** Deterministic PRNG so repeated runs produce the same shape. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  if (process.env.DEMO_MODE === 'false') {
    throw new Error('Refusing to generate traffic: DEMO_MODE is false.');
  }

  const workspace = await prisma.workspace.findUnique({
    where: { slug: 'northwind-labs' },
    select: { id: true, isDemoWorkspace: true },
  });

  if (!workspace) {
    throw new Error('Demo workspace not found. Run the seed first.');
  }
  if (!workspace.isDemoWorkspace) {
    throw new Error('Refusing to generate traffic against a non-demo workspace.');
  }

  const applications = await prisma.application.findMany({
    where: { workspaceId: workspace.id },
    include: { environments: true },
  });

  const policies = await prisma.routingPolicy.findMany({
    where: { workspaceId: workspace.id, status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (applications.length === 0 || policies.length === 0) {
    throw new Error('Seed the workspace before generating traffic.');
  }

  const random = createRandom(20260802);
  let generated = 0;
  let failures = 0;

  console.log(`\nGenerating demonstration traffic across ${DAYS} days\n`);

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset -= 1) {
    const count = requestsForDay(dayOffset, random);

    for (let index = 0; index < count; index += 1) {
      const application = applications[Math.floor(random() * applications.length)]!;
      // Production carries most traffic, as it would in a real workspace.
      const environment =
        random() > 0.3
          ? application.environments.find((e) => e.type === 'PRODUCTION')!
          : application.environments.find((e) => e.type === 'DEVELOPMENT')!;
      const policy = policies[Math.floor(random() * policies.length)]!;
      const prompt = PROMPTS[Math.floor(random() * PROMPTS.length)]!;

      // Roughly one request in twelve hits a provider fault, which is a
      // plausible rate for a service with a flaky upstream.
      let behaviour: DemoBehaviour | undefined;
      let scope: 'all' | 'first_candidate' | undefined;
      const roll = random();

      if (roll < 0.05) {
        behaviour = { forceTimeout: true };
        scope = 'first_candidate';
      } else if (roll < 0.08) {
        behaviour = { forceRateLimit: true };
        scope = 'first_candidate';
      } else if (roll < 0.09) {
        behaviour = { forceUnavailable: true };
        scope = 'all';
      }

      const result = await runCompletion({
        workspaceId: workspace.id,
        applicationId: application.id,
        environmentId: environment.id,
        environmentType: environment.type,
        apiKeyId: null,
        policyId: policy.id,
        messages: [{ role: 'user', content: `${prompt} (${dayOffset}-${index})` }],
        maxTokens: 300,
        demoBehaviour: behaviour,
        demoBehaviourScope: scope,
        source: 'traffic',
      });

      // Place the request on its intended day, at a plausible working hour.
      const at = new Date();
      at.setUTCDate(at.getUTCDate() - dayOffset);
      at.setUTCHours(8 + Math.floor(random() * 10), Math.floor(random() * 60), 0, 0);

      await prisma.request.update({
        where: { id: result.requestDbId },
        data: { createdAt: at },
      });

      await prisma.requestAttempt.updateMany({
        where: { requestId: result.requestDbId },
        data: { startedAt: at },
      });

      generated += 1;
      if (result.status !== 'SUCCEEDED') failures += 1;
    }

    // Aggregate the day's usage onto the correct date.
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - dayOffset);
    day.setUTCHours(0, 0, 0, 0);

    process.stdout.write(
      `  ${day.toISOString().slice(0, 10)}  ${String(count).padStart(2)} requests\n`,
    );
  }

  // Rebuild the daily rollup from the backdated rows so analytics agrees with
  // the request table rather than with when the seed happened to run.
  await prisma.usageDaily.deleteMany({ where: { workspaceId: workspace.id } });

  const rows = await prisma.request.findMany({
    where: { workspaceId: workspace.id },
    select: {
      applicationId: true,
      environmentId: true,
      createdAt: true,
      status: true,
      fallbackUsed: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCost: true,
      totalLatencyMs: true,
    },
  });

  const buckets = new Map<
    string,
    {
      applicationId: string;
      environmentId: string;
      day: Date;
      requestCount: number;
      successCount: number;
      failureCount: number;
      fallbackCount: number;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
      totalLatencyMs: bigint;
    }
  >();

  for (const row of rows) {
    const day = new Date(row.createdAt);
    day.setUTCHours(0, 0, 0, 0);
    const key = `${row.applicationId}:${row.environmentId}:${day.toISOString()}`;

    const bucket = buckets.get(key) ?? {
      applicationId: row.applicationId,
      environmentId: row.environmentId,
      day,
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      fallbackCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      totalLatencyMs: 0n,
    };

    bucket.requestCount += 1;
    if (row.status === 'SUCCEEDED') bucket.successCount += 1;
    else bucket.failureCount += 1;
    if (row.fallbackUsed) bucket.fallbackCount += 1;
    bucket.inputTokens += row.inputTokens;
    bucket.outputTokens += row.outputTokens;
    bucket.estimatedCost += Number(row.estimatedCost);
    bucket.totalLatencyMs += BigInt(row.totalLatencyMs);

    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    await prisma.usageDaily.create({
      data: { workspaceId: workspace.id, ...bucket },
    });
  }

  console.log(`\nGenerated ${generated} requests (${failures} failed).`);
  console.log(`Rebuilt ${buckets.size} daily usage rows.\n`);
}

main()
  .catch((error) => {
    console.error('Traffic generation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
