'use server';

import { z } from 'zod';

import { projectCost } from '@/lib/ai/pricing';
import { evaluateRoute } from '@/lib/ai/routing/engine';
import type {
  RouteCandidate,
  RouteExplanation,
  ScoringWeights,
} from '@/lib/ai/routing/types';
import { DEFAULT_SCORING_WEIGHTS } from '@/lib/ai/routing/types';
import { estimateMessagesTokens } from '@/lib/ai/tokens';
import type { Capability } from '@/lib/ai/types';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { PermissionDeniedError } from '@/lib/permissions/rbac';

const previewSchema = z.object({
  policyId: z.string().min(1),
  prompt: z.string().min(1).max(32_000),
});

export interface PreviewResult {
  ok: boolean;
  error?: string;
  explanation?: RouteExplanation;
}

/**
 * Evaluates a policy without executing it.
 *
 * Reuses the same `evaluateRoute` the gateway calls, so a preview cannot drift
 * from what the request path would actually do.
 */
export async function previewRouteAction(input: unknown): Promise<PreviewResult> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid preview input.' };

  let context;
  try {
    context = await requirePermission('policy:test');
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return {
        ok: false,
        error: 'Your role does not permit testing routing policies.',
      };
    }
    throw error;
  }

  const policy = await prisma.routingPolicy.findFirst({
    where: { id: parsed.data.policyId, workspaceId: context.workspaceId },
    include: {
      rules: {
        where: { enabled: true },
        include: { model: { include: { connection: true } } },
        orderBy: { priority: 'asc' },
      },
    },
  });

  if (!policy) return { ok: false, error: 'That routing policy was not found.' };

  const estimatedInput = estimateMessagesTokens([
    { role: 'user', content: parsed.data.prompt },
  ]);
  const estimatedOutput = 512;

  const modelIds = policy.rules.map((rule) => rule.modelId);

  const recent = await prisma.requestAttempt.groupBy({
    by: ['modelId', 'status'],
    where: {
      modelId: { in: modelIds },
      startedAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
    },
    _count: { _all: true },
    _avg: { latencyMs: true },
  });

  const signals = new Map<
    string,
    { successes: number; failures: number; latency: number; samples: number }
  >();

  for (const row of recent) {
    if (!row.modelId) continue;
    const entry = signals.get(row.modelId) ?? {
      successes: 0,
      failures: 0,
      latency: 0,
      samples: 0,
    };
    if (row.status === 'SUCCEEDED') {
      entry.successes += row._count._all;
      entry.latency += (row._avg.latencyMs ?? 0) * row._count._all;
      entry.samples += row._count._all;
    } else if (row.status !== 'SKIPPED') {
      entry.failures += row._count._all;
    }
    signals.set(row.modelId, entry);
  }

  const candidates: RouteCandidate[] = policy.rules.map((rule) => {
    const model = rule.model;
    const signal = signals.get(model.id);
    const total = (signal?.successes ?? 0) + (signal?.failures ?? 0);

    const capabilities: Capability[] = [];
    if (model.supportsStreaming) capabilities.push('streaming');
    if (model.supportsStructured) capabilities.push('structured_output');
    if (model.supportsVision) capabilities.push('vision');
    if (model.supportsToolUse) capabilities.push('tool_use');

    const inputPrice = Number(model.inputPricePerMillion);
    const outputPrice = Number(model.outputPricePerMillion);

    return {
      modelId: model.id,
      modelLabel: model.modelId,
      displayName: model.displayName,
      providerKind: model.connection.kind,
      connectionId: model.connectionId,
      priority: rule.priority,
      weight: rule.weight,
      contextWindow: model.contextWindow,
      capabilities,
      inputPricePerMillion: inputPrice,
      outputPricePerMillion: outputPrice,
      projectedCost: projectCost(estimatedInput, estimatedOutput, {
        inputPricePerMillion: inputPrice,
        outputPricePerMillion: outputPrice,
      }),
      healthState: model.healthState,
      recentLatencyMs:
        signal && signal.samples > 0 ? signal.latency / signal.samples : null,
      recentSuccessRate: total > 0 ? (signal?.successes ?? 0) / total : null,
      recentSampleSize: total,
      isAvailable: model.isAvailable && model.connection.status === 'ACTIVE',
      isDemoModel: model.isDemoModel,
    };
  });

  const requirements = policy.requirements as { capabilities?: Capability[] } | null;
  const weights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...((policy.scoring as Partial<ScoringWeights> | null) ?? {}),
  };

  const route = evaluateRoute({
    policyId: policy.id,
    policyName: policy.name,
    strategy: policy.strategy,
    candidates,
    requirements: {
      capabilities: requirements?.capabilities ?? [],
      minContextWindow: estimatedInput + estimatedOutput,
      maxEstimatedCost:
        policy.maxEstimatedCost === null ? null : Number(policy.maxEstimatedCost),
    },
    weights,
  });

  return { ok: true, explanation: route.explanation };
}
