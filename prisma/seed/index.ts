import 'dotenv/config';

import { runCompletion } from '@/lib/ai/gateway';
import { DEMO_MODELS } from '@/lib/ai/providers/demo';
import { generateApiKey } from '@/lib/api-keys/keys';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/database/client';
import type {
  EnvironmentType,
  RoutingStrategy,
  WorkspaceRole,
} from '@/lib/database/generated/enums';

import { DEMO_SCENARIOS } from './scenarios';

/**
 * Demo seed.
 *
 * The scenarios at the end are executed through `runCompletion` — the same
 * function the public API calls. Every request row, attempt row, route
 * explanation and trace stage in the seeded workspace is therefore real output
 * from the production code path, not a fixture. That is what makes the
 * dashboard figures honest.
 *
 * Guarded: refuses to run when DEMO_MODE is explicitly disabled.
 */

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'OmniDemo!2026';

const DEMO_ACCOUNTS: Array<{
  email: string;
  name: string;
  role: WorkspaceRole;
}> = [
  { email: 'owner@omnirouter.demo', name: 'Dana Whitfield', role: 'OWNER' },
  { email: 'admin@omnirouter.demo', name: 'Marcus Lindqvist', role: 'ADMIN' },
  {
    email: 'developer@omnirouter.demo',
    name: 'Priya Raghunathan',
    role: 'DEVELOPER',
  },
  { email: 'viewer@omnirouter.demo', name: 'Tom Achebe', role: 'VIEWER' },
];

interface PolicyDefinition {
  name: string;
  description: string;
  strategy: RoutingStrategy;
  models: Array<{ modelLabel: string; priority: number; weight: number }>;
  maxAttempts: number;
  requirements?: Record<string, unknown>;
}

const POLICIES: PolicyDefinition[] = [
  {
    name: 'Balanced production',
    description:
      'Weighs health, recent success rate, latency and cost against the configured scoring weights.',
    strategy: 'BALANCED',
    models: [
      { modelLabel: 'astra-fast', priority: 1, weight: 3 },
      { modelLabel: 'astra-pro', priority: 2, weight: 2 },
      { modelLabel: 'local-ember', priority: 3, weight: 1 },
    ],
    maxAttempts: 3,
  },
  {
    name: 'Lowest cost bulk',
    description:
      'For high-volume classification where the cheapest capable model is preferred.',
    strategy: 'LOWEST_ESTIMATED_COST',
    models: [
      { modelLabel: 'local-ember', priority: 1, weight: 1 },
      { modelLabel: 'astra-fast', priority: 2, weight: 1 },
      { modelLabel: 'nimbus-reasoning', priority: 3, weight: 1 },
    ],
    maxAttempts: 3,
  },
  {
    name: 'Fastest response',
    description: 'Selects on recent measured latency for interactive, user-facing paths.',
    strategy: 'LOWEST_RECENT_LATENCY',
    models: [
      { modelLabel: 'astra-fast', priority: 1, weight: 1 },
      { modelLabel: 'local-ember', priority: 2, weight: 1 },
      { modelLabel: 'astra-pro', priority: 3, weight: 1 },
    ],
    maxAttempts: 2,
  },
  {
    name: 'Structured extraction',
    description:
      'Requires structured-output support; models without it are filtered out before scoring.',
    strategy: 'CAPABILITY_MATCH',
    models: [
      { modelLabel: 'astra-pro', priority: 1, weight: 1 },
      { modelLabel: 'nimbus-reasoning', priority: 2, weight: 1 },
      { modelLabel: 'astra-fast', priority: 3, weight: 1 },
    ],
    maxAttempts: 3,
    requirements: { capabilities: ['structured_output'] },
  },
  {
    name: 'Reliability first',
    description: 'Prefers the healthiest target with the strongest recent success rate.',
    strategy: 'RELIABILITY_FIRST',
    models: [
      { modelLabel: 'astra-pro', priority: 1, weight: 1 },
      { modelLabel: 'astra-fast', priority: 2, weight: 1 },
      { modelLabel: 'local-ember', priority: 3, weight: 1 },
    ],
    maxAttempts: 3,
  },
];

const APPLICATIONS = [
  {
    name: 'Support Copilot',
    slug: 'support-copilot',
    description:
      'Drafts agent replies and summarises support threads inside the helpdesk.',
    defaultPolicy: 'Balanced production',
  },
  {
    name: 'Bulk Classifier',
    slug: 'bulk-classifier',
    description: 'Categorises inbound messages in batches on a nightly schedule.',
    defaultPolicy: 'Lowest cost bulk',
  },
];

function log(step: string, detail: string): void {
  console.log(`  ${step.padEnd(22)} ${detail}`);
}

async function main(): Promise<void> {
  if (process.env.DEMO_MODE === 'false') {
    throw new Error(
      'Refusing to seed: DEMO_MODE is false. The demo seed must never run against a production workspace.',
    );
  }

  console.log('\nSeeding OmniRouter demo workspace\n');

  // --- Workspace ----------------------------------------------------------
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'northwind-labs' },
    update: {},
    create: {
      name: 'Northwind Labs',
      slug: 'northwind-labs',
      contentLoggingMode: 'METADATA_ONLY',
      isDemoWorkspace: true,
      // Protected so a public visitor cannot delete shared demonstration data.
      isProtected: true,
    },
  });
  log('workspace', workspace.name);

  // --- Accounts -----------------------------------------------------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const account of DEMO_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, passwordHash, isDemoAccount: true },
      create: {
        email: account.email,
        name: account.name,
        passwordHash,
        isDemoAccount: true,
        status: 'ACTIVE',
      },
    });

    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
      },
      update: { role: account.role },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: account.role,
      },
    });
  }
  log('accounts', `${DEMO_ACCOUNTS.length} demo users with distinct roles`);

  // --- Provider connection and models -------------------------------------
  const connection = await prisma.providerConnection.upsert({
    where: {
      workspaceId_kind_label: {
        workspaceId: workspace.id,
        kind: 'DEMO',
        label: 'Deterministic demo provider',
      },
    },
    update: { status: 'ACTIVE', healthState: 'HEALTHY' },
    create: {
      workspaceId: workspace.id,
      kind: 'DEMO',
      label: 'Deterministic demo provider',
      // No credential: the demo provider runs in-process.
      credentialCiphertext: null,
      status: 'ACTIVE',
      healthState: 'HEALTHY',
      lastCheckedAt: new Date(),
    },
  });

  const modelsByLabel = new Map<string, string>();

  for (const spec of Object.values(DEMO_MODELS)) {
    const model = await prisma.modelDefinition.upsert({
      where: {
        connectionId_modelId: {
          connectionId: connection.id,
          modelId: spec.modelId,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        connectionId: connection.id,
        modelId: spec.modelId,
        displayName: spec.displayName,
        isDemoModel: true,
        contextWindow: spec.contextWindow,
        supportsStreaming: spec.capabilities.includes('streaming'),
        supportsStructured: spec.capabilities.includes('structured_output'),
        supportsVision: spec.capabilities.includes('vision'),
        supportsToolUse: spec.capabilities.includes('tool_use'),
        inputPricePerMillion: spec.inputPricePerMillion,
        outputPricePerMillion: spec.outputPricePerMillion,
        isAvailable: true,
        healthState: 'HEALTHY',
      },
    });

    modelsByLabel.set(spec.modelId, model.id);
  }
  log('models', `${modelsByLabel.size} fictional demo models catalogued`);

  // --- Routing policies ---------------------------------------------------
  const policiesByName = new Map<string, string>();

  for (const definition of POLICIES) {
    const policy = await prisma.routingPolicy.upsert({
      where: {
        workspaceId_name: { workspaceId: workspace.id, name: definition.name },
      },
      update: { strategy: definition.strategy, status: 'ACTIVE' },
      create: {
        workspaceId: workspace.id,
        name: definition.name,
        description: definition.description,
        strategy: definition.strategy,
        status: 'ACTIVE',
        maxAttempts: definition.maxAttempts,
        attemptTimeoutMs: 30_000,
        totalTimeoutMs: 60_000,
        // Prisma types JSONB columns as InputJsonValue, which a bare
        // Record<string, unknown> does not structurally satisfy.
        requirements: (definition.requirements ?? {}) as object,
        scoring: {},
      },
    });

    policiesByName.set(definition.name, policy.id);

    for (const rule of definition.models) {
      const modelId = modelsByLabel.get(rule.modelLabel);
      if (!modelId) continue;

      await prisma.routingRule.upsert({
        where: { policyId_modelId: { policyId: policy.id, modelId } },
        update: { priority: rule.priority, weight: rule.weight },
        create: {
          policyId: policy.id,
          modelId,
          priority: rule.priority,
          weight: rule.weight,
          enabled: true,
        },
      });
    }
  }
  log('policies', `${policiesByName.size} routing policies with ordered rules`);

  // --- Applications and environments --------------------------------------
  const environments = new Map<string, Array<{ id: string; type: EnvironmentType }>>();
  const applicationsBySlug = new Map<string, string>();

  for (const definition of APPLICATIONS) {
    const application = await prisma.application.upsert({
      where: {
        workspaceId_slug: { workspaceId: workspace.id, slug: definition.slug },
      },
      update: { name: definition.name, description: definition.description },
      create: {
        workspaceId: workspace.id,
        name: definition.name,
        slug: definition.slug,
        description: definition.description,
      },
    });

    applicationsBySlug.set(definition.slug, application.id);

    const defaultPolicyId = policiesByName.get(definition.defaultPolicy) ?? null;
    const created: Array<{ id: string; type: EnvironmentType }> = [];

    for (const type of ['DEVELOPMENT', 'PRODUCTION'] as EnvironmentType[]) {
      const environment = await prisma.environment.upsert({
        where: { applicationId_type: { applicationId: application.id, type } },
        update: { defaultPolicyId },
        create: { applicationId: application.id, type, defaultPolicyId },
      });

      created.push({ id: environment.id, type });
    }

    environments.set(definition.slug, created);
  }
  log('applications', `${applicationsBySlug.size} applications, 2 environments each`);

  // --- Virtual API keys ---------------------------------------------------
  let keyCount = 0;
  const revealedKeys: string[] = [];

  for (const [slug, applicationId] of applicationsBySlug) {
    for (const environment of environments.get(slug) ?? []) {
      const existing = await prisma.virtualAPIKey.findFirst({
        where: { applicationId, environmentId: environment.id },
      });

      if (existing) continue;

      const generated = generateApiKey(environment.type);
      const label = environment.type === 'PRODUCTION' ? 'Production' : 'Development';

      await prisma.virtualAPIKey.create({
        data: {
          workspaceId: workspace.id,
          applicationId,
          environmentId: environment.id,
          name: `${label} key`,
          keyPrefix: generated.keyPrefix,
          // Only the hash is stored; the plaintext is revealed once, here.
          keyHash: generated.keyHash,
          scopes: ['chat.completions'],
          status: 'ACTIVE',
        },
      });

      revealedKeys.push(`${slug} / ${label}: ${generated.plaintext}`);
      keyCount += 1;
    }
  }

  // A revoked key so the request explorer has a rejection to show.
  const supportAppId = applicationsBySlug.get('support-copilot');
  const supportDev = environments.get('support-copilot')?.[0];

  if (supportAppId && supportDev) {
    const exists = await prisma.virtualAPIKey.findFirst({
      where: { applicationId: supportAppId, name: 'Retired integration key' },
    });

    if (!exists) {
      const revoked = generateApiKey('DEVELOPMENT');
      await prisma.virtualAPIKey.create({
        data: {
          workspaceId: workspace.id,
          applicationId: supportAppId,
          environmentId: supportDev.id,
          name: 'Retired integration key',
          keyPrefix: revoked.keyPrefix,
          keyHash: revoked.keyHash,
          scopes: ['chat.completions'],
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });
      keyCount += 1;
    }
  }
  log('api keys', `${keyCount} virtual keys (hashed; one revoked)`);

  // --- Prompt registry ----------------------------------------------------
  const promptName = 'Support reply drafter';
  const existingPrompt = await prisma.prompt.findUnique({
    where: { workspaceId_name: { workspaceId: workspace.id, name: promptName } },
  });

  if (!existingPrompt) {
    const prompt = await prisma.prompt.create({
      data: {
        workspaceId: workspace.id,
        name: promptName,
        description:
          'Drafts a first-pass reply for a support agent to review before sending.',
      },
    });

    await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: 1,
        systemPrompt: 'You are a support assistant. Be brief and factual.',
        userTemplate: 'Draft a reply to: {{message}}',
        variables: ['message'],
        changeNote: 'Initial version.',
        testCases: [{ message: 'My invoice is wrong.' }],
      },
    });

    const v2 = await prisma.promptVersion.create({
      data: {
        promptId: prompt.id,
        version: 2,
        systemPrompt:
          'You are a support assistant. Be brief, factual and warm. Never promise a refund without checking policy.',
        userTemplate: 'Customer tone: {{tone}}\n\nDraft a reply to: {{message}}',
        variables: ['message', 'tone'],
        changeNote:
          'Added a tone variable and a guard against promising refunds unprompted.',
        testCases: [{ message: 'My invoice is wrong.', tone: 'frustrated' }],
      },
    });

    await prisma.prompt.update({
      where: { id: prompt.id },
      data: { activeVersionId: v2.id },
    });

    log('prompts', '1 prompt, 2 versions (v2 active, v1 available for rollback)');
  } else {
    log('prompts', 'already present');
  }

  // --- Quotas -------------------------------------------------------------
  const bulkAppId = applicationsBySlug.get('bulk-classifier');
  const existingQuotas = await prisma.quota.count({
    where: { workspaceId: workspace.id },
  });

  if (existingQuotas === 0) {
    await prisma.quota.create({
      data: {
        workspaceId: workspace.id,
        name: 'Workspace daily ceiling',
        window: 'DAY',
        maxRequests: 5_000,
        maxTokens: 2_000_000,
        maxCost: 25,
        warnThreshold: 0.8,
        action: 'WARN',
      },
    });

    if (bulkAppId) {
      await prisma.quota.create({
        data: {
          workspaceId: workspace.id,
          applicationId: bulkAppId,
          name: 'Bulk classifier burst limit',
          window: 'MINUTE',
          maxRequests: 120,
          warnThreshold: 0.75,
          action: 'REJECT',
        },
      });
    }
    log('quotas', '2 quotas (workspace daily, application burst)');
  } else {
    log('quotas', 'already present');
  }

  // --- Health history -----------------------------------------------------
  const healthCount = await prisma.providerHealthCheck.count({
    where: { workspaceId: workspace.id },
  });

  if (healthCount === 0) {
    const now = Date.now();
    // A degradation followed by a recovery, so the health screen has a story.
    const history = [
      { hoursAgo: 12, state: 'HEALTHY' as const, detail: 'Routine check passed.' },
      { hoursAgo: 9, state: 'HEALTHY' as const, detail: 'Routine check passed.' },
      {
        hoursAgo: 6,
        state: 'DEGRADED' as const,
        detail: 'Elevated latency observed on consecutive probes.',
      },
      {
        hoursAgo: 4,
        state: 'DEGRADED' as const,
        detail: 'Latency remained above the configured threshold.',
      },
      {
        hoursAgo: 2,
        state: 'HEALTHY' as const,
        detail: 'Latency returned to normal.',
      },
      { hoursAgo: 0, state: 'HEALTHY' as const, detail: 'Routine check passed.' },
    ];

    for (const entry of history) {
      await prisma.providerHealthCheck.create({
        data: {
          workspaceId: workspace.id,
          connectionId: connection.id,
          state: entry.state,
          latencyMs: entry.state === 'DEGRADED' ? 2_400 : 320,
          detail: entry.detail,
          checkedAt: new Date(now - entry.hoursAgo * 3_600_000),
        },
      });
    }
    log('health', `${history.length} checks including a degradation and recovery`);
  } else {
    log('health', 'already present');
  }

  // --- Scenario definitions -----------------------------------------------
  for (const scenario of DEMO_SCENARIOS) {
    await prisma.demoScenario.upsert({
      where: {
        workspaceId_key: { workspaceId: workspace.id, key: scenario.key },
      },
      update: {
        title: scenario.title,
        description: scenario.description,
        behaviour: (scenario.behaviour ?? {}) as object,
        sortOrder: scenario.sortOrder,
      },
      create: {
        workspaceId: workspace.id,
        key: scenario.key,
        title: scenario.title,
        description: scenario.description,
        behaviour: (scenario.behaviour ?? {}) as object,
        sortOrder: scenario.sortOrder,
      },
    });
  }
  log('scenarios', `${DEMO_SCENARIOS.length} scenario definitions registered`);

  // --- Execute the scenarios through the real gateway ---------------------
  const existingRequests = await prisma.request.count({
    where: { workspaceId: workspace.id },
  });

  if (existingRequests === 0) {
    console.log('\n  Executing scenarios through the gateway:\n');

    for (const scenario of DEMO_SCENARIOS) {
      const applicationId = applicationsBySlug.get(scenario.applicationSlug);
      const environment = environments
        .get(scenario.applicationSlug)
        ?.find((entry) => entry.type === scenario.environment);

      if (!applicationId || !environment) continue;

      const messages = [
        ...(scenario.systemPrompt
          ? [{ role: 'system' as const, content: scenario.systemPrompt }]
          : []),
        { role: 'user' as const, content: scenario.prompt },
      ];

      const result = await runCompletion({
        workspaceId: workspace.id,
        applicationId,
        environmentId: environment.id,
        environmentType: environment.type,
        apiKeyId: null,
        policyId: scenario.policyName
          ? (policiesByName.get(scenario.policyName) ?? null)
          : null,
        messages,
        maxTokens: 400,
        structuredOutputSchema: scenario.structuredOutput
          ? {
              type: 'object',
              properties: {
                customer: { type: 'string' },
                sentiment: { type: 'string' },
                priority: { type: 'number' },
              },
              required: ['customer', 'sentiment', 'priority'],
            }
          : undefined,
        demoBehaviour: scenario.behaviour,
        demoBehaviourScope: scenario.scope,
        source: 'seed',
      });

      const outcome =
        result.status === 'SUCCEEDED'
          ? result.fallbackUsed
            ? 'succeeded via fallback'
            : 'succeeded'
          : `${result.status.toLowerCase()} (${result.errorCategory})`;

      console.log(
        `    ${scenario.key.padEnd(24)} ${outcome.padEnd(26)} ${result.attempts.length} attempt(s)`,
      );
    }
  } else {
    log('requests', `${existingRequests} already present, skipping execution`);
  }

  // --- Audit trail --------------------------------------------------------
  const auditCount = await prisma.auditLog.count({
    where: { workspaceId: workspace.id },
  });

  if (auditCount === 0) {
    const owner = await prisma.user.findUnique({
      where: { email: 'owner@omnirouter.demo' },
    });

    const entries = [
      {
        action: 'workspace.created',
        resourceType: 'workspace',
        detail: 'Northwind Labs',
      },
      {
        action: 'provider.connected',
        resourceType: 'provider_connection',
        detail: 'Demo provider',
      },
      {
        action: 'policy.created',
        resourceType: 'routing_policy',
        detail: 'Balanced production',
      },
      {
        action: 'policy.activated',
        resourceType: 'routing_policy',
        detail: 'Balanced production',
      },
      {
        action: 'application.created',
        resourceType: 'application',
        detail: 'Support Copilot',
      },
      {
        action: 'apikey.created',
        resourceType: 'virtual_api_key',
        detail: 'Production key',
      },
      {
        action: 'apikey.revoked',
        resourceType: 'virtual_api_key',
        detail: 'Retired integration key',
      },
      {
        action: 'prompt.version_created',
        resourceType: 'prompt',
        detail: 'Support reply drafter v2',
      },
      {
        action: 'quota.created',
        resourceType: 'quota',
        detail: 'Workspace daily ceiling',
      },
      {
        action: 'member.invited',
        resourceType: 'workspace_member',
        detail: 'developer@omnirouter.demo',
      },
    ];

    for (const [index, entry] of entries.entries()) {
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: owner?.id ?? null,
          actorLabel: owner?.email ?? 'system',
          action: entry.action,
          resourceType: entry.resourceType,
          newState: { detail: entry.detail },
          createdAt: new Date(Date.now() - (entries.length - index) * 3_600_000),
        },
      });
    }
    log('audit', `${entries.length} audit entries`);
  } else {
    log('audit', 'already present');
  }

  // --- Summary ------------------------------------------------------------
  const [requests, attempts] = await Promise.all([
    prisma.request.count({ where: { workspaceId: workspace.id } }),
    prisma.requestAttempt.count({
      where: { request: { workspaceId: workspace.id } },
    }),
  ]);

  console.log('\nSeed complete.');
  console.log(`  Requests:  ${requests}`);
  console.log(`  Attempts:  ${attempts}`);
  console.log(`\n  Demo sign-in: ${DEMO_ACCOUNTS[0]?.email} / ${DEMO_PASSWORD}`);

  if (revealedKeys.length > 0) {
    console.log('\n  Virtual API keys (shown once, stored only as a hash):');
    for (const line of revealedKeys) console.log(`    ${line}`);
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
