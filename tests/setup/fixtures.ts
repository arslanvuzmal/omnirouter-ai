import { randomUUID } from 'node:crypto';

import { DEMO_MODELS } from '@/lib/ai/providers/demo';
import { generateApiKey } from '@/lib/api-keys/keys';
import { hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/database/client';
import type { RoutingStrategy, WorkspaceRole } from '@/lib/database/generated/enums';

import { TEST_PREFIX } from './database';

/**
 * Builds a complete, isolated workspace for a test.
 *
 * Every fixture is namespaced so parallel or repeated runs cannot collide, and
 * so cleanup can remove exactly what a run created.
 */

export interface TestWorkspace {
  workspaceId: string;
  userId: string;
  email: string;
  applicationId: string;
  developmentEnvironmentId: string;
  productionEnvironmentId: string;
  policyId: string;
  modelIds: Record<string, string>;
  apiKeyPlaintext: string;
  apiKeyId: string;
}

export async function createTestWorkspace(
  options: { role?: WorkspaceRole; strategy?: RoutingStrategy } = {},
): Promise<TestWorkspace> {
  const unique = randomUUID().slice(0, 8);
  const slug = `${TEST_PREFIX}-${unique}`;
  const email = `${TEST_PREFIX}-${unique}@example.test`;

  const workspace = await prisma.workspace.create({
    data: { name: `Test ${unique}`, slug, contentLoggingMode: 'METADATA_ONLY' },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: `Test User ${unique}`,
      passwordHash: await hashPassword('TestPassword123'),
      status: 'ACTIVE',
    },
  });

  await prisma.workspaceMember.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      role: options.role ?? 'OWNER',
    },
  });

  const connection = await prisma.providerConnection.create({
    data: {
      workspaceId: workspace.id,
      kind: 'DEMO',
      label: 'Demo provider',
      status: 'ACTIVE',
      healthState: 'HEALTHY',
    },
  });

  const modelIds: Record<string, string> = {};

  for (const spec of Object.values(DEMO_MODELS)) {
    const model = await prisma.modelDefinition.create({
      data: {
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
    modelIds[spec.modelId] = model.id;
  }

  const policy = await prisma.routingPolicy.create({
    data: {
      workspaceId: workspace.id,
      name: `Policy ${unique}`,
      strategy: options.strategy ?? 'PRIORITY',
      status: 'ACTIVE',
      maxAttempts: 3,
      attemptTimeoutMs: 10_000,
      totalTimeoutMs: 30_000,
      requirements: {},
      scoring: {},
      rules: {
        create: [
          { modelId: modelIds['astra-fast'] as string, priority: 1, weight: 1 },
          { modelId: modelIds['local-ember'] as string, priority: 2, weight: 1 },
          { modelId: modelIds['astra-pro'] as string, priority: 3, weight: 1 },
        ],
      },
    },
  });

  const application = await prisma.application.create({
    data: {
      workspaceId: workspace.id,
      name: `App ${unique}`,
      slug: `app-${unique}`,
    },
  });

  const development = await prisma.environment.create({
    data: {
      applicationId: application.id,
      type: 'DEVELOPMENT',
      defaultPolicyId: policy.id,
    },
  });

  const production = await prisma.environment.create({
    data: {
      applicationId: application.id,
      type: 'PRODUCTION',
      defaultPolicyId: policy.id,
    },
  });

  const generated = generateApiKey('DEVELOPMENT');
  const apiKey = await prisma.virtualAPIKey.create({
    data: {
      workspaceId: workspace.id,
      applicationId: application.id,
      environmentId: development.id,
      name: 'Test key',
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scopes: ['chat.completions'],
      status: 'ACTIVE',
    },
  });

  return {
    workspaceId: workspace.id,
    userId: user.id,
    email,
    applicationId: application.id,
    developmentEnvironmentId: development.id,
    productionEnvironmentId: production.id,
    policyId: policy.id,
    modelIds,
    apiKeyPlaintext: generated.plaintext,
    apiKeyId: apiKey.id,
  };
}

export async function destroyTestWorkspace(workspace: TestWorkspace): Promise<void> {
  await prisma.workspace.deleteMany({ where: { id: workspace.workspaceId } });
  await prisma.user.deleteMany({ where: { id: workspace.userId } });
}
