import { ArrowRight, FlaskConical, Workflow } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  EnvironmentBadge,
  ErrorBadge,
  FallbackBadge,
  RequestStatusBadge,
} from '@/components/dashboard/status';
import {
  Button,
  DemoDataNotice,
  EmptyState,
  Panel,
  PanelHeader,
  Stat,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import { formatCost, formatTokens } from '@/lib/ai/pricing';
import {
  getErrorGroups,
  getModelDistribution,
  getOverviewMetrics,
  getRecentRequests,
} from '@/lib/analytics/queries';
import { requireWorkspace } from '@/lib/auth/guard';
import { formatLatency, formatPercent, formatRelative } from '@/lib/utils';

export const metadata: Metadata = { title: 'Overview' };

export default async function DashboardOverviewPage() {
  const { workspaceId, membership } = await requireWorkspace();

  const [metrics, recent, models, errors] = await Promise.all([
    getOverviewMetrics({ workspaceId, days: 30 }),
    getRecentRequests({ workspaceId }, 8),
    getModelDistribution({ workspaceId, days: 30 }),
    getErrorGroups({ workspaceId, days: 30 }),
  ]);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Traffic, reliability and estimated cost across every application in this workspace, over the last 30 days."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
        actions={
          <>
            <Link href="/dashboard/playground">
              <Button variant="secondary" size="sm">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                Playground
              </Button>
            </Link>
            <Link href="/dashboard/routing">
              <Button variant="primary" size="sm">
                <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                Routing policies
              </Button>
            </Link>
          </>
        }
      />

      <PageBody>
        {metrics.totalRequests === 0 ? (
          <EmptyState
            title="No requests yet"
            description="Once an application sends its first request through the gateway, traffic, reliability and cost figures appear here. The playground is the quickest way to produce one."
            action={
              <Link href="/dashboard/playground">
                <Button variant="primary" size="sm">
                  Open the playground
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </Link>
            }
          />
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Requests"
                value={metrics.totalRequests.toLocaleString()}
                hint={`${metrics.succeeded} succeeded, ${metrics.failed} failed, ${metrics.rejected} rejected`}
              />
              <Stat
                label="Success rate"
                value={formatPercent(metrics.successRate)}
                tone={
                  metrics.successRate >= 0.95
                    ? 'success'
                    : metrics.successRate >= 0.8
                      ? 'warning'
                      : 'danger'
                }
                hint="Share of requests that returned a provider response"
              />
              <Stat
                label="Fallback rate"
                value={formatPercent(metrics.fallbackRate)}
                tone={metrics.fallbackRate > 0 ? 'warning' : 'neutral'}
                hint="Requests that recovered on a different model"
              />
              <Stat
                label="Estimated cost"
                value={formatCost(metrics.estimatedCost)}
                hint="From workspace-configured pricing — an estimate, not a bill"
              />
            </dl>

            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="P50 latency"
                value={formatLatency(metrics.p50LatencyMs)}
                hint="Median, successful requests only"
              />
              <Stat
                label="P95 latency"
                value={formatLatency(metrics.p95LatencyMs)}
                tone={metrics.p95LatencyMs > 3000 ? 'warning' : 'neutral'}
                hint="What your slowest users experience"
              />
              <Stat
                label="Tokens"
                value={formatTokens(metrics.totalTokens)}
                hint={`${formatTokens(metrics.inputTokens)} in, ${formatTokens(metrics.outputTokens)} out`}
              />
              <Stat
                label="Average latency"
                value={formatLatency(metrics.averageLatencyMs)}
                hint="Mean across all requests"
              />
            </dl>

            <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
              <Panel>
                <PanelHeader
                  title="Recent requests"
                  description="Every request opens into a full trace with per-attempt timings."
                  actions={
                    <Link href="/dashboard/requests">
                      <Button size="sm" variant="ghost">
                        View all
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </Link>
                  }
                />
                <Table
                  caption="Most recent requests in this workspace"
                  head={
                    <>
                      <Th>Status</Th>
                      <Th>Application</Th>
                      <Th>Model</Th>
                      <Th className="text-right">Latency</Th>
                      <Th className="text-right">Cost</Th>
                      <Th>When</Th>
                    </>
                  }
                >
                  {recent.map((request) => (
                    <tr key={request.id} className="hover:bg-base-850/60">
                      <Td>
                        <Link
                          href={`/dashboard/requests/${request.id}`}
                          className="flex flex-wrap items-center gap-1.5"
                        >
                          <RequestStatusBadge status={request.status} />
                          <FallbackBadge used={request.fallbackUsed} />
                          {request.errorCategory ? (
                            <ErrorBadge category={request.errorCategory} />
                          ) : null}
                        </Link>
                      </Td>
                      <Td>
                        <span className="block text-xs text-ink-200">
                          {request.application.name}
                        </span>
                        <span className="mt-0.5 block">
                          <EnvironmentBadge type={request.environment.type} />
                        </span>
                      </Td>
                      <Td className="font-mono text-xs">
                        {request.resolvedModel ?? '—'}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {formatLatency(request.totalLatencyMs)}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {formatCost(Number(request.estimatedCost))}
                      </Td>
                      <Td className="text-xs whitespace-nowrap text-ink-400">
                        {formatRelative(request.createdAt)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Panel>

              <div className="space-y-5">
                <Panel>
                  <PanelHeader
                    title="Traffic by model"
                    description="Counted per provider attempt, including attempts that failed."
                  />
                  <div className="px-5 py-4">
                    {models.length === 0 ? (
                      <p className="text-xs text-ink-600">No attempts recorded.</p>
                    ) : (
                      <ul className="space-y-3">
                        {models.map((model) => {
                          const share =
                            models[0] && models[0].requests > 0
                              ? model.requests / models[0].requests
                              : 0;

                          return (
                            <li key={model.label}>
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="truncate font-mono text-xs text-ink-200">
                                  {model.label}
                                </span>
                                <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">
                                  {model.requests}
                                </span>
                              </div>
                              {/* Bar is decorative; the number above carries the value. */}
                              <div
                                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-base-800"
                                aria-hidden="true"
                              >
                                <div
                                  className="h-full rounded-full bg-primary-500"
                                  style={{ width: `${Math.max(share * 100, 3)}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[10px] text-ink-600">
                                {model.succeeded} succeeded ·{' '}
                                {formatLatency(model.averageLatencyMs)} avg ·{' '}
                                {formatCost(model.estimatedCost)}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader
                    title="Failures by category"
                    description="Grouped, because a list of individual errors is noise."
                  />
                  <div className="px-5 py-4">
                    {errors.length === 0 ? (
                      <p className="text-xs text-ink-600">
                        No failures in this window.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {errors.map((group) => (
                          <li
                            key={group.category}
                            className="flex items-center justify-between gap-3"
                          >
                            <ErrorBadge category={group.category} />
                            <span className="font-mono text-xs tabular-nums text-ink-400">
                              {group.count} · {formatPercent(group.share, 0)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
