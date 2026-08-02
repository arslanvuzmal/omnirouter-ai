import { prisma } from '@/lib/database/client';
import type { ErrorCategory } from '@/lib/database/generated/enums';
import { percentile } from '@/lib/utils';

/**
 * Analytics.
 *
 * Every figure is computed from persisted rows. Nothing here is synthesised or
 * padded — if the workspace has no traffic, the numbers are zero and the
 * interface says so rather than inventing a trend line.
 */

export interface AnalyticsFilters {
  workspaceId: string;
  applicationId?: string;
  environmentId?: string;
  days?: number;
}

export interface OverviewMetrics {
  totalRequests: number;
  succeeded: number;
  failed: number;
  rejected: number;
  successRate: number;
  fallbackRate: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

function windowStart(days: number): Date {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since;
}

function baseWhere(filters: AnalyticsFilters) {
  return {
    workspaceId: filters.workspaceId,
    ...(filters.applicationId ? { applicationId: filters.applicationId } : {}),
    ...(filters.environmentId ? { environmentId: filters.environmentId } : {}),
    createdAt: { gte: windowStart(filters.days ?? 30) },
  };
}

export async function getOverviewMetrics(
  filters: AnalyticsFilters,
): Promise<OverviewMetrics> {
  const where = baseWhere(filters);

  const [aggregate, statusCounts, fallbackCount, latencies] = await Promise.all([
    prisma.request.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCost: true,
        totalLatencyMs: true,
      },
    }),
    prisma.request.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    prisma.request.count({ where: { ...where, fallbackUsed: true } }),
    // Percentiles need the sample, not an aggregate. Only successful requests
    // are included: a request that failed fast would flatter the P95.
    prisma.request.findMany({
      where: { ...where, status: 'SUCCEEDED' },
      select: { totalLatencyMs: true },
      take: 5_000,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const byStatus = new Map(
    statusCounts.map((row) => [row.status, row._count._all]),
  );

  const total = aggregate._count._all;
  const succeeded = byStatus.get('SUCCEEDED') ?? 0;
  const sample = latencies.map((row) => row.totalLatencyMs);

  return {
    totalRequests: total,
    succeeded,
    failed: byStatus.get('FAILED') ?? 0,
    rejected: byStatus.get('REJECTED') ?? 0,
    successRate: total > 0 ? succeeded / total : 0,
    fallbackRate: total > 0 ? fallbackCount / total : 0,
    averageLatencyMs:
      total > 0 ? Math.round((aggregate._sum.totalLatencyMs ?? 0) / total) : 0,
    p50LatencyMs: percentile(sample, 50),
    p95LatencyMs: percentile(sample, 95),
    inputTokens: aggregate._sum.inputTokens ?? 0,
    outputTokens: aggregate._sum.outputTokens ?? 0,
    totalTokens: aggregate._sum.totalTokens ?? 0,
    estimatedCost: Number(aggregate._sum.estimatedCost ?? 0),
  };
}

export interface DailyPoint {
  day: string;
  requests: number;
  succeeded: number;
  failed: number;
  fallbacks: number;
  estimatedCost: number;
}

export async function getDailySeries(
  filters: AnalyticsFilters,
): Promise<DailyPoint[]> {
  const days = filters.days ?? 30;
  const since = windowStart(days);

  const rows = await prisma.request.findMany({
    where: baseWhere(filters),
    select: {
      createdAt: true,
      status: true,
      fallbackUsed: true,
      estimatedCost: true,
    },
  });

  // Pre-fill every day so a gap in traffic renders as zero rather than as a
  // missing point the chart would interpolate across.
  const buckets = new Map<string, DailyPoint>();

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(since);
    day.setUTCDate(day.getUTCDate() + offset);
    const key = day.toISOString().slice(0, 10);
    buckets.set(key, {
      day: key,
      requests: 0,
      succeeded: 0,
      failed: 0,
      fallbacks: 0,
      estimatedCost: 0,
    });
  }

  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;

    bucket.requests += 1;
    if (row.status === 'SUCCEEDED') bucket.succeeded += 1;
    else bucket.failed += 1;
    if (row.fallbackUsed) bucket.fallbacks += 1;
    bucket.estimatedCost += Number(row.estimatedCost);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    estimatedCost: Math.round(bucket.estimatedCost * 1e6) / 1e6,
  }));
}

export interface DistributionSlice {
  label: string;
  requests: number;
  succeeded: number;
  estimatedCost: number;
  averageLatencyMs: number;
}

/**
 * Per-model distribution.
 *
 * Derived from RequestAttempt rather than the daily rollup, because an attempt
 * carries the model that actually served it — including attempts that failed
 * and were replaced by a fallback.
 */
export async function getModelDistribution(
  filters: AnalyticsFilters,
): Promise<DistributionSlice[]> {
  const attempts = await prisma.requestAttempt.groupBy({
    by: ['modelLabel', 'status'],
    where: {
      request: baseWhere(filters),
      status: { not: 'SKIPPED' },
    },
    _count: { _all: true },
    _sum: { estimatedCost: true },
    _avg: { latencyMs: true },
  });

  const merged = new Map<string, DistributionSlice>();

  for (const row of attempts) {
    const entry = merged.get(row.modelLabel) ?? {
      label: row.modelLabel,
      requests: 0,
      succeeded: 0,
      estimatedCost: 0,
      averageLatencyMs: 0,
    };

    const count = row._count._all;
    // Weighted running mean so per-status averages combine correctly.
    const previousTotal = entry.requests;
    entry.requests += count;
    entry.averageLatencyMs =
      entry.requests > 0
        ? (entry.averageLatencyMs * previousTotal +
            (row._avg.latencyMs ?? 0) * count) /
          entry.requests
        : 0;

    if (row.status === 'SUCCEEDED') entry.succeeded += count;
    entry.estimatedCost += Number(row._sum.estimatedCost ?? 0);

    merged.set(row.modelLabel, entry);
  }

  return [...merged.values()]
    .map((entry) => ({
      ...entry,
      averageLatencyMs: Math.round(entry.averageLatencyMs),
      estimatedCost: Math.round(entry.estimatedCost * 1e6) / 1e6,
    }))
    .sort((a, b) => b.requests - a.requests);
}

export async function getProviderDistribution(
  filters: AnalyticsFilters,
): Promise<DistributionSlice[]> {
  const attempts = await prisma.requestAttempt.groupBy({
    by: ['providerKind', 'status'],
    where: { request: baseWhere(filters), status: { not: 'SKIPPED' } },
    _count: { _all: true },
    _sum: { estimatedCost: true },
    _avg: { latencyMs: true },
  });

  const merged = new Map<string, DistributionSlice>();

  for (const row of attempts) {
    const entry = merged.get(row.providerKind) ?? {
      label: row.providerKind,
      requests: 0,
      succeeded: 0,
      estimatedCost: 0,
      averageLatencyMs: 0,
    };

    const count = row._count._all;
    const previousTotal = entry.requests;
    entry.requests += count;
    entry.averageLatencyMs =
      entry.requests > 0
        ? (entry.averageLatencyMs * previousTotal +
            (row._avg.latencyMs ?? 0) * count) /
          entry.requests
        : 0;

    if (row.status === 'SUCCEEDED') entry.succeeded += count;
    entry.estimatedCost += Number(row._sum.estimatedCost ?? 0);

    merged.set(row.providerKind, entry);
  }

  return [...merged.values()]
    .map((entry) => ({
      ...entry,
      averageLatencyMs: Math.round(entry.averageLatencyMs),
    }))
    .sort((a, b) => b.requests - a.requests);
}

export async function getApplicationDistribution(
  filters: AnalyticsFilters,
): Promise<DistributionSlice[]> {
  const rows = await prisma.request.groupBy({
    by: ['applicationId'],
    where: baseWhere(filters),
    _count: { _all: true },
    _sum: { estimatedCost: true },
    _avg: { totalLatencyMs: true },
  });

  const applications = await prisma.application.findMany({
    where: { workspaceId: filters.workspaceId },
    select: { id: true, name: true },
  });

  const names = new Map(applications.map((app) => [app.id, app.name]));

  return rows
    .map((row) => ({
      label: names.get(row.applicationId) ?? 'Unknown application',
      requests: row._count._all,
      succeeded: 0,
      estimatedCost: Number(row._sum.estimatedCost ?? 0),
      averageLatencyMs: Math.round(row._avg.totalLatencyMs ?? 0),
    }))
    .sort((a, b) => b.requests - a.requests);
}

export interface ErrorGroup {
  category: ErrorCategory;
  count: number;
  share: number;
}

/**
 * Errors grouped by category.
 *
 * A list of individual failures is noise; "312 × RATE_LIMIT" is an action.
 */
export async function getErrorGroups(
  filters: AnalyticsFilters,
): Promise<ErrorGroup[]> {
  const rows = await prisma.request.groupBy({
    by: ['errorCategory'],
    where: { ...baseWhere(filters), errorCategory: { not: null } },
    _count: { _all: true },
  });

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);

  return rows
    .filter((row): row is typeof row & { errorCategory: ErrorCategory } =>
      Boolean(row.errorCategory),
    )
    .map((row) => ({
      category: row.errorCategory,
      count: row._count._all,
      share: total > 0 ? row._count._all / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getRecentRequests(
  filters: AnalyticsFilters,
  limit = 10,
) {
  return prisma.request.findMany({
    where: { workspaceId: filters.workspaceId },
    select: {
      id: true,
      correlationId: true,
      status: true,
      errorCategory: true,
      resolvedModel: true,
      fallbackUsed: true,
      totalTokens: true,
      estimatedCost: true,
      totalLatencyMs: true,
      attemptCount: true,
      createdAt: true,
      application: { select: { name: true } },
      environment: { select: { type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
