import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCompletion } from '@/lib/ai/gateway';
import { prisma } from '@/lib/database/client';

import {
  createTestWorkspace,
  destroyTestWorkspace,
  type TestWorkspace,
} from '../setup/fixtures';

/**
 * Gateway integration.
 *
 * Exercises the real execution path against a real database, so persistence,
 * routing, fallback and usage recording are verified together rather than in
 * isolation.
 */

let workspace: TestWorkspace;

beforeAll(async () => {
  workspace = await createTestWorkspace();
});

afterAll(async () => {
  await destroyTestWorkspace(workspace);
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: workspace.workspaceId,
    applicationId: workspace.applicationId,
    environmentId: workspace.developmentEnvironmentId,
    environmentType: 'DEVELOPMENT' as const,
    apiKeyId: null,
    policyId: workspace.policyId,
    messages: [{ role: 'user' as const, content: 'Integration test prompt.' }],
    maxTokens: 200,
    source: 'test',
    ...overrides,
  };
}

describe('gateway: successful request', () => {
  it('completes and persists a request row', async () => {
    const result = await runCompletion(baseInput());

    expect(result.status).toBe('SUCCEEDED');
    expect(result.content).toBeTruthy();
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);

    const stored = await prisma.request.findUnique({
      where: { id: result.requestDbId },
      include: { attempts: true },
    });

    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('SUCCEEDED');
    expect(stored?.attempts).toHaveLength(1);
    expect(stored?.workspaceId).toBe(workspace.workspaceId);
  });

  it('stores the routing explanation and the trace stages', async () => {
    const result = await runCompletion(baseInput());

    const stored = await prisma.request.findUniqueOrThrow({
      where: { id: result.requestDbId },
    });

    expect(stored.routeExplanation).not.toBeNull();
    expect(stored.traceStages).not.toBeNull();

    const explanation = stored.routeExplanation as Record<string, unknown>;
    expect(explanation.strategy).toBe('PRIORITY');
    expect(Array.isArray(explanation.candidates)).toBe(true);
    expect(Array.isArray(explanation.rejectedCandidates)).toBe(true);
  });

  it('records token usage and a non-negative estimated cost', async () => {
    const result = await runCompletion(baseInput());

    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(
      result.usage.inputTokens + result.usage.outputTokens,
    );
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('selects the highest-priority target under a PRIORITY policy', async () => {
    const result = await runCompletion(baseInput());
    expect(result.model).toBe('astra-fast');
  });

  it('is deterministic: the same prompt yields the same response', async () => {
    const a = await runCompletion(baseInput());
    const b = await runCompletion(baseInput());

    expect(a.content).toBe(b.content);
    expect(a.usage.outputTokens).toBe(b.usage.outputTokens);
  });

  it('does not persist prompt or response content under metadata-only logging', async () => {
    const result = await runCompletion(baseInput());

    const stored = await prisma.request.findUniqueOrThrow({
      where: { id: result.requestDbId },
    });

    expect(stored.promptPreview).toBeNull();
    expect(stored.responsePreview).toBeNull();
  });
});

describe('gateway: fallback', () => {
  it('records every attempt when the primary target fails', async () => {
    const result = await runCompletion(
      baseInput({
        demoBehaviour: { forceUnavailable: true },
        demoBehaviourScope: 'first_candidate',
      }),
    );

    expect(result.status).toBe('SUCCEEDED');
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.length).toBeGreaterThanOrEqual(2);

    const stored = await prisma.request.findUniqueOrThrow({
      where: { id: result.requestDbId },
      include: { attempts: { orderBy: { sequence: 'asc' } } },
    });

    expect(stored.attempts).toHaveLength(result.attempts.length);
    expect(stored.attempts[0]?.status).toBe('FAILED');
    expect(stored.attempts[0]?.errorCategory).toBe('PROVIDER_UNAVAILABLE');
    expect(stored.attempts.at(-1)?.status).toBe('SUCCEEDED');
    // The fallback must be a different model, not a retry of the same one.
    expect(stored.attempts.at(-1)?.modelLabel).not.toBe(stored.attempts[0]?.modelLabel);
  });

  it('retries the same target on a timeout before moving on', async () => {
    const result = await runCompletion(
      baseInput({
        demoBehaviour: { forceTimeout: true },
        demoBehaviourScope: 'first_candidate',
      }),
    );

    const labels = result.attempts.map((attempt) => attempt.modelLabel);
    // Two attempts against the primary, then a different model.
    expect(labels[0]).toBe('astra-fast');
    expect(labels[1]).toBe('astra-fast');
    expect(labels[2]).not.toBe('astra-fast');
  });

  it('returns a safety refusal to the caller without trying another provider', async () => {
    const result = await runCompletion(
      baseInput({ demoBehaviour: { forceSafetyRefusal: true } }),
    );

    expect(result.status).toBe('FAILED');
    expect(result.errorCategory).toBe('SAFETY_REFUSAL');
    expect(result.attempts).toHaveLength(1);
  });

  it('does not retry an invalid request across targets', async () => {
    const result = await runCompletion(
      baseInput({ demoBehaviour: { forceContextLimit: true } }),
    );

    expect(result.status).toBe('FAILED');
    expect(result.errorCategory).toBe('CONTEXT_LIMIT');
  });

  it('never charges for a failed attempt', async () => {
    const result = await runCompletion(
      baseInput({
        demoBehaviour: { forceUnavailable: true },
        demoBehaviourScope: 'first_candidate',
      }),
    );

    const failed = result.attempts.filter((a) => a.status !== 'SUCCEEDED');
    for (const attempt of failed) {
      expect(attempt.estimatedCost).toBe(0);
      expect(attempt.inputTokens).toBe(0);
    }
  });
});

describe('gateway: usage aggregation', () => {
  it('increments the daily rollup for each request', async () => {
    const isolated = await createTestWorkspace();

    try {
      const before = await prisma.usageDaily.findFirst({
        where: { workspaceId: isolated.workspaceId },
      });
      expect(before).toBeNull();

      await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'first' }],
        maxTokens: 100,
        source: 'test',
      });

      await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'second' }],
        maxTokens: 100,
        source: 'test',
      });

      const rollup = await prisma.usageDaily.findFirstOrThrow({
        where: { workspaceId: isolated.workspaceId },
      });

      // A single row per environment per day, incremented — not duplicated.
      expect(rollup.requestCount).toBe(2);
      expect(rollup.successCount).toBe(2);
      expect(rollup.inputTokens).toBeGreaterThan(0);

      const rows = await prisma.usageDaily.count({
        where: { workspaceId: isolated.workspaceId },
      });
      expect(rows).toBe(1);
    } finally {
      await destroyTestWorkspace(isolated);
    }
  });
});

describe('gateway: quotas', () => {
  it('rejects a request once a REJECT quota is exceeded', async () => {
    const isolated = await createTestWorkspace();

    try {
      await prisma.quota.create({
        data: {
          workspaceId: isolated.workspaceId,
          name: 'Test hard cap',
          window: 'DAY',
          maxRequests: 1,
          warnThreshold: 0.5,
          action: 'REJECT',
          enabled: true,
        },
      });

      const first = await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'within quota' }],
        source: 'test',
      });
      expect(first.status).toBe('SUCCEEDED');

      const second = await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'over quota' }],
        source: 'test',
      });

      expect(second.status).toBe('REJECTED');
      expect(second.errorCategory).toBe('QUOTA_EXCEEDED');
      // A rejected request must never reach a provider.
      expect(second.attempts).toHaveLength(0);
    } finally {
      await destroyTestWorkspace(isolated);
    }
  });

  it('warns without blocking when the threshold is crossed', async () => {
    const isolated = await createTestWorkspace();

    try {
      await prisma.quota.create({
        data: {
          workspaceId: isolated.workspaceId,
          name: 'Test warning',
          window: 'DAY',
          maxRequests: 10,
          warnThreshold: 0.01,
          action: 'WARN',
          enabled: true,
        },
      });

      await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'one' }],
        source: 'test',
      });

      const second = await runCompletion({
        workspaceId: isolated.workspaceId,
        applicationId: isolated.applicationId,
        environmentId: isolated.developmentEnvironmentId,
        environmentType: 'DEVELOPMENT',
        apiKeyId: null,
        policyId: isolated.policyId,
        messages: [{ role: 'user', content: 'two' }],
        source: 'test',
      });

      expect(second.status).toBe('SUCCEEDED');
      expect(second.quotaWarning).toContain('Test warning');
    } finally {
      await destroyTestWorkspace(isolated);
    }
  });
});
