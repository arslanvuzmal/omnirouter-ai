import type { Metadata } from 'next';

import {
  CostTrendChart,
  DistributionChart,
  FallbackTrendChart,
  RequestVolumeChart,
} from '@/components/analytics/charts';
import { PageBody, PageHeader } from '@/components/dashboard/shell';
import { ErrorBadge } from '@/components/dashboard/status';
import {
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
  getApplicationDistribution,
  getDailySeries,
  getErrorGroups,
  getModelDistribution,
  getOverviewMetrics,
  getProviderDistribution,
} from '@/lib/analytics/queries';
import { requireWorkspace } from '@/lib/auth/guard';
import { formatLatency, formatPercent } from '@/lib/utils';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const { workspaceId, membership } = await requireWorkspace();
  const filters = { workspaceId, days: 30 };

  const [metrics, series, models, providers, applications, errors] = await Promise.all([
    getOverviewMetrics(filters),
    getDailySeries(filters),
    getModelDistribution(filters),
    getProviderDistribution(filters),
    getApplicationDistribution(filters),
    getErrorGroups(filters),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Computed from persisted request and attempt rows over the last 30 days. Nothing on this page is synthesised."
        meta={membership.isDemoWorkspace ? <DemoDataNotice /> : null}
      />

      <PageBody>
        {metrics.totalRequests === 0 ? (
          <EmptyState
            title="No traffic to analyse"
            description="Analytics are derived from real request rows. Send a request through the playground or the API and figures will appear here."
          />
        ) : (
          <>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Total requests"
                value={metrics.totalRequests.toLocaleString()}
                hint="Last 30 days"
              />
              <Stat
                label="Success rate"
                value={formatPercent(metrics.successRate)}
                tone={metrics.successRate >= 0.95 ? 'success' : 'warning'}
              />
              <Stat
                label="P95 latency"
                value={formatLatency(metrics.p95LatencyMs)}
                hint={`P50 ${formatLatency(metrics.p50LatencyMs)}`}
              />
              <Stat
                label="Estimated cost"
                value={formatCost(metrics.estimatedCost)}
                hint={`${formatTokens(metrics.totalTokens)} tokens`}
              />
            </dl>

            <Panel>
              <PanelHeader
                title="Requests over time"
                description="Successful and failed requests per day, stacked."
                as="h2"
              />
              <div className="px-3 py-4">
                <RequestVolumeChart data={series} />
              </div>
            </Panel>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  title="Fallback trend"
                  description="How often the primary target failed and a fallback completed the request."
                  as="h2"
                />
                <div className="px-3 py-4">
                  <FallbackTrendChart data={series} />
                </div>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Estimated cost trend"
                  description="From workspace-configured pricing. An estimate, not a bill."
                  as="h2"
                />
                <div className="px-3 py-4">
                  <CostTrendChart data={series} />
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  title="Attempts by model"
                  description="Counted per provider attempt, so failed attempts are included."
                  as="h2"
                />
                <div className="px-3 py-4">
                  <DistributionChart data={models} label="Attempts" />
                </div>
                <Table
                  caption="Attempts by model"
                  head={
                    <>
                      <Th>Model</Th>
                      <Th className="text-right">Attempts</Th>
                      <Th className="text-right">Succeeded</Th>
                      <Th className="text-right">Avg latency</Th>
                      <Th className="text-right">Cost</Th>
                    </>
                  }
                >
                  {models.map((model) => (
                    <tr key={model.label}>
                      <Td className="font-mono text-xs">{model.label}</Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {model.requests}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums text-success-400">
                        {model.succeeded}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {formatLatency(model.averageLatencyMs)}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {formatCost(model.estimatedCost)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              </Panel>

              <div className="space-y-5">
                <Panel>
                  <PanelHeader
                    title="Attempts by provider"
                    description="Which upstream providers served this workspace."
                    as="h2"
                  />
                  <div className="px-3 py-4">
                    <DistributionChart data={providers} label="Attempts" />
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader title="Requests by application" as="h2" />
                  <Table
                    caption="Requests by application"
                    head={
                      <>
                        <Th>Application</Th>
                        <Th className="text-right">Requests</Th>
                        <Th className="text-right">Avg latency</Th>
                        <Th className="text-right">Cost</Th>
                      </>
                    }
                  >
                    {applications.map((app) => (
                      <tr key={app.label}>
                        <Td className="text-xs">{app.label}</Td>
                        <Td className="text-right font-mono text-xs tabular-nums">
                          {app.requests}
                        </Td>
                        <Td className="text-right font-mono text-xs tabular-nums">
                          {formatLatency(app.averageLatencyMs)}
                        </Td>
                        <Td className="text-right font-mono text-xs tabular-nums">
                          {formatCost(app.estimatedCost)}
                        </Td>
                      </tr>
                    ))}
                  </Table>
                </Panel>
              </div>
            </div>

            <Panel>
              <PanelHeader
                title="Failures by category"
                description="Grouped so an operator sees a pattern rather than a list."
                as="h2"
              />
              {errors.length === 0 ? (
                <p className="px-5 py-4 text-xs text-ink-600">
                  No failures recorded in this window.
                </p>
              ) : (
                <Table
                  caption="Failures grouped by category"
                  head={
                    <>
                      <Th>Category</Th>
                      <Th className="text-right">Count</Th>
                      <Th className="text-right">Share</Th>
                    </>
                  }
                >
                  {errors.map((group) => (
                    <tr key={group.category}>
                      <Td>
                        <ErrorBadge category={group.category} />
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums">
                        {group.count}
                      </Td>
                      <Td className="text-right font-mono text-xs tabular-nums text-ink-400">
                        {formatPercent(group.share, 0)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Panel>
          </>
        )}
      </PageBody>
    </>
  );
}
