import 'server-only';

import { prisma } from '@/lib/database/client';
import type { QuotaAction, QuotaWindow } from '@/lib/database/generated/enums';

/**
 * Quota evaluation.
 *
 * Quotas are checked before a provider call and recorded after it. The check
 * reads aggregates inside a single query per window so a burst of concurrent
 * requests cannot each observe a stale "under limit" state and collectively
 * overshoot — the counting query and the rejection decision happen together.
 */

export interface QuotaEvaluation {
  allowed: boolean;
  action: QuotaAction | null;
  /** True when consumption crossed the warning threshold but not the limit. */
  warning: boolean;
  quotaName: string | null;
  window: QuotaWindow | null;
  detail: string | null;
  usage: {
    requests: number;
    tokens: number;
    cost: number;
  } | null;
  limit: {
    requests: number | null;
    tokens: number | null;
    cost: number | null;
  } | null;
}

const ALLOWED: QuotaEvaluation = {
  allowed: true,
  action: null,
  warning: false,
  quotaName: null,
  window: null,
  detail: null,
  usage: null,
  limit: null,
};

export function windowStart(window: QuotaWindow, now: Date = new Date()): Date {
  const start = new Date(now);

  switch (window) {
    case 'MINUTE':
      start.setSeconds(0, 0);
      return start;
    case 'DAY':
      start.setUTCHours(0, 0, 0, 0);
      return start;
    case 'MONTH':
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return start;
  }
}

export interface QuotaScope {
  workspaceId: string;
  applicationId: string;
  environmentId: string;
}

/**
 * Evaluates every enabled quota that applies to this scope.
 *
 * The most restrictive outcome wins: a REJECT anywhere rejects, otherwise the
 * first breached WARN or ROUTE_LOWER_COST is reported.
 */
export async function evaluateQuotas(
  scope: QuotaScope,
  now: Date = new Date(),
): Promise<QuotaEvaluation> {
  const quotas = await prisma.quota.findMany({
    where: {
      workspaceId: scope.workspaceId,
      enabled: true,
      // A quota with a null application/environment applies workspace-wide.
      AND: [
        {
          OR: [{ applicationId: null }, { applicationId: scope.applicationId }],
        },
        {
          OR: [{ environmentId: null }, { environmentId: scope.environmentId }],
        },
      ],
    },
  });

  if (quotas.length === 0) return ALLOWED;

  let breach: QuotaEvaluation | null = null;
  let warning: QuotaEvaluation | null = null;

  for (const quota of quotas) {
    const since = windowStart(quota.window, now);

    const aggregate = await prisma.request.aggregate({
      where: {
        workspaceId: scope.workspaceId,
        ...(quota.applicationId ? { applicationId: quota.applicationId } : {}),
        ...(quota.environmentId ? { environmentId: quota.environmentId } : {}),
        createdAt: { gte: since },
        // Rejected requests never reached a provider, so they do not consume.
        status: { in: ['SUCCEEDED', 'FAILED'] },
      },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true },
    });

    const usage = {
      requests: aggregate._count._all,
      tokens: aggregate._sum.totalTokens ?? 0,
      cost: Number(aggregate._sum.estimatedCost ?? 0),
    };

    const limit = {
      requests: quota.maxRequests,
      tokens: quota.maxTokens,
      cost: quota.maxCost === null ? null : Number(quota.maxCost),
    };

    const ratios: number[] = [];
    if (limit.requests !== null && limit.requests > 0) {
      ratios.push(usage.requests / limit.requests);
    }
    if (limit.tokens !== null && limit.tokens > 0) {
      ratios.push(usage.tokens / limit.tokens);
    }
    if (limit.cost !== null && limit.cost > 0) {
      ratios.push(usage.cost / limit.cost);
    }

    if (ratios.length === 0) continue;

    const peak = Math.max(...ratios);
    const threshold = Number(quota.warnThreshold);

    if (peak >= 1) {
      const evaluation: QuotaEvaluation = {
        allowed: quota.action !== 'REJECT',
        action: quota.action,
        warning: false,
        quotaName: quota.name,
        window: quota.window,
        detail: describeBreach(quota.name, quota.window, usage, limit),
        usage,
        limit,
      };

      if (quota.action === 'REJECT') return evaluation;
      breach = breach ?? evaluation;
      continue;
    }

    if (peak >= threshold && !warning) {
      warning = {
        allowed: true,
        action: 'WARN',
        warning: true,
        quotaName: quota.name,
        window: quota.window,
        detail: `Quota "${quota.name}" is at ${Math.round(peak * 100)}% of its ${quota.window.toLowerCase()} limit.`,
        usage,
        limit,
      };
    }
  }

  return breach ?? warning ?? ALLOWED;
}

function describeBreach(
  name: string,
  window: QuotaWindow,
  usage: { requests: number; tokens: number; cost: number },
  limit: { requests: number | null; tokens: number | null; cost: number | null },
): string {
  const parts: string[] = [];

  if (limit.requests !== null && usage.requests >= limit.requests) {
    parts.push(`${usage.requests}/${limit.requests} requests`);
  }
  if (limit.tokens !== null && usage.tokens >= limit.tokens) {
    parts.push(`${usage.tokens}/${limit.tokens} tokens`);
  }
  if (limit.cost !== null && usage.cost >= limit.cost) {
    parts.push(`$${usage.cost.toFixed(4)}/$${limit.cost.toFixed(4)} estimated cost`);
  }

  return `Quota "${name}" reached its ${window.toLowerCase()} limit (${parts.join(', ')}).`;
}

/**
 * Folds a completed request into the daily aggregate.
 *
 * Uses a single upsert so concurrent completions cannot lose an increment.
 */
export async function recordUsage(input: {
  workspaceId: string;
  applicationId: string;
  environmentId: string;
  succeeded: boolean;
  fallbackUsed: boolean;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  at?: Date;
}): Promise<void> {
  const day = new Date(input.at ?? new Date());
  day.setUTCHours(0, 0, 0, 0);

  const increment = {
    requestCount: 1,
    successCount: input.succeeded ? 1 : 0,
    failureCount: input.succeeded ? 0 : 1,
    fallbackCount: input.fallbackUsed ? 1 : 0,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  };

  await prisma.usageDaily.upsert({
    where: {
      workspaceId_applicationId_environmentId_day: {
        workspaceId: input.workspaceId,
        applicationId: input.applicationId,
        environmentId: input.environmentId,
        day,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      day,
      ...increment,
      estimatedCost: input.estimatedCost,
      totalLatencyMs: BigInt(input.latencyMs),
    },
    update: {
      requestCount: { increment: increment.requestCount },
      successCount: { increment: increment.successCount },
      failureCount: { increment: increment.failureCount },
      fallbackCount: { increment: increment.fallbackCount },
      inputTokens: { increment: increment.inputTokens },
      outputTokens: { increment: increment.outputTokens },
      estimatedCost: { increment: input.estimatedCost },
      totalLatencyMs: { increment: BigInt(input.latencyMs) },
    },
  });
}
