import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageBody, PageHeader } from '@/components/dashboard/shell';
import {
  EnvironmentBadge,
  ErrorBadge,
  FallbackBadge,
  RequestStatusBadge,
} from '@/components/dashboard/status';
import { TracePanels, type AttemptView } from '@/components/requests/trace';
import { Button, Panel, PanelHeader, Stat } from '@/components/ui/primitives';
import type { TraceStage } from '@/lib/ai/gateway';
import { formatCost } from '@/lib/ai/pricing';
import type { RouteExplanation } from '@/lib/ai/routing/types';
import { requireWorkspace } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { formatDateTime, formatLatency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Request trace' };

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { workspaceId } = await requireWorkspace();
  const { id } = await params;

  // Scoped by workspaceId as well as id: a request from another tenant must be
  // indistinguishable from one that does not exist.
  const request = await prisma.request.findFirst({
    where: { id, workspaceId },
    include: {
      attempts: { orderBy: { sequence: 'asc' } },
      application: { select: { name: true } },
      environment: { select: { type: true } },
      policy: { select: { id: true, name: true, strategy: true } },
      apiKey: { select: { name: true, keyPrefix: true } },
    },
  });

  if (!request) notFound();

  const stages = (request.traceStages as TraceStage[] | null) ?? [];
  const explanation = request.routeExplanation as RouteExplanation | null;

  const attempts: AttemptView[] = request.attempts.map((attempt) => ({
    id: attempt.id,
    sequence: attempt.sequence,
    status: attempt.status,
    providerKind: attempt.providerKind,
    modelLabel: attempt.modelLabel,
    errorCategory: attempt.errorCategory,
    errorMessage: attempt.errorMessage,
    inputTokens: attempt.inputTokens,
    outputTokens: attempt.outputTokens,
    estimatedCost: Number(attempt.estimatedCost),
    latencyMs: attempt.latencyMs,
    providerRequestId: attempt.providerRequestId,
    reason: attempt.reason,
  }));

  return (
    <>
      <PageHeader
        title="Request trace"
        description={`Correlation ID ${request.correlationId}`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={request.status} />
            <FallbackBadge used={request.fallbackUsed} />
            {request.errorCategory ? (
              <ErrorBadge category={request.errorCategory} />
            ) : null}
            <EnvironmentBadge type={request.environment.type} />
            <span className="text-xs text-ink-600">
              {request.application.name} · {formatDateTime(request.createdAt)}
            </span>
          </div>
        }
        actions={
          <Link href="/dashboard/requests">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All requests
            </Button>
          </Link>
        }
      />

      <PageBody>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Total latency"
            value={formatLatency(request.totalLatencyMs)}
            hint="End to end, including retries"
          />
          <Stat
            label="Attempts"
            value={request.attemptCount}
            tone={request.attemptCount > 1 ? 'warning' : 'neutral'}
            hint={request.fallbackUsed ? 'Recovered on a fallback' : 'Single target'}
          />
          <Stat
            label="Tokens"
            value={request.totalTokens.toLocaleString()}
            hint={`${request.inputTokens} in, ${request.outputTokens} out`}
          />
          <Stat
            label="Estimated cost"
            value={formatCost(Number(request.estimatedCost))}
            hint="From configured pricing"
          />
          <Stat
            label="Resolved model"
            value={
              <span className="font-mono text-base">{request.resolvedModel ?? '—'}</span>
            }
            hint={request.policy ? `via ${request.policy.name}` : 'No policy'}
          />
        </dl>

        {request.errorMessage ? (
          <Panel className="border-danger-400/30">
            <PanelHeader
              title="Failure"
              description="The message returned to the caller. Provider error text is never forwarded verbatim."
            />
            <p className="px-5 py-4 text-xs leading-relaxed text-danger-400">
              {request.errorMessage}
            </p>
          </Panel>
        ) : null}

        <TracePanels stages={stages} attempts={attempts} explanation={explanation} />

        <Panel>
          <PanelHeader
            title="Content logging"
            description="This workspace's logging mode determines whether prompt and response bodies are retained."
          />
          <div className="px-5 py-4">
            {request.promptPreview || request.responsePreview ? (
              <div className="space-y-3">
                {request.promptPreview ? (
                  <div>
                    <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                      Prompt
                    </h4>
                    <pre className="mt-1.5 overflow-x-auto rounded border border-base-700 bg-base-850 p-3 font-mono text-[11px] whitespace-pre-wrap text-ink-200">
                      {request.promptPreview}
                    </pre>
                  </div>
                ) : null}
                {request.responsePreview ? (
                  <div>
                    <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
                      Response
                    </h4>
                    <pre className="mt-1.5 overflow-x-auto rounded border border-base-700 bg-base-850 p-3 font-mono text-[11px] whitespace-pre-wrap text-ink-200">
                      {request.responsePreview}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-ink-400">
                No prompt or response body was stored for this request. The workspace is
                set to <strong className="text-ink-200">metadata only</strong>, which
                records counts, timings, cost and routing decisions but never the content
                itself.
              </p>
            )}
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
