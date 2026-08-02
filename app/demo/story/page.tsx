import type { Metadata } from 'next';
import Link from 'next/link';

import { OmniRouterWordmark } from '@/components/brand/wordmark';
import { Badge, Panel } from '@/components/ui/primitives';
import { prisma } from '@/lib/database/client';

import { StoryPlayer } from './story-player';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client story mode',
  description:
    'A guided walkthrough: a request routes, a provider fails, and the fallback recovers — with the trace open the whole time.',
};

/**
 * Client Story Mode.
 *
 * A guided, self-contained walkthrough intended to be watchable in about sixty
 * seconds. It reads genuine seeded requests from the database rather than
 * scripted screenshots, so what a viewer sees is real output from the gateway.
 */
export default async function StoryPage() {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: 'northwind-labs' },
    select: { id: true },
  });

  if (!workspace) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-5 py-20">
        <h1 className="text-2xl font-semibold text-ink-50">
          Demonstration data is not seeded
        </h1>
        <p className="mt-3 text-sm text-ink-400">
          Run the demo seed to populate the workspace this walkthrough reads
          from.
        </p>
      </main>
    );
  }

  // Pick genuine examples of each outcome from the seeded traffic.
  const [normal, fallback, failure] = await Promise.all([
    prisma.request.findFirst({
      where: { workspaceId: workspace.id, status: 'SUCCEEDED', fallbackUsed: false },
      include: { attempts: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.request.findFirst({
      where: { workspaceId: workspace.id, fallbackUsed: true, status: 'SUCCEEDED' },
      include: { attempts: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.request.findFirst({
      where: { workspaceId: workspace.id, errorCategory: 'SAFETY_REFUSAL' },
      include: { attempts: { orderBy: { sequence: 'asc' } } },
    }),
  ]);

  const [applications, policies, models, requestCount] = await Promise.all([
    prisma.application.count({ where: { workspaceId: workspace.id } }),
    prisma.routingPolicy.count({ where: { workspaceId: workspace.id } }),
    prisma.modelDefinition.count({ where: { workspaceId: workspace.id } }),
    prisma.request.count({ where: { workspaceId: workspace.id } }),
  ]);

  const serialise = (request: typeof normal) =>
    request
      ? {
          id: request.id,
          correlationId: request.correlationId,
          status: request.status,
          resolvedModel: request.resolvedModel,
          fallbackUsed: request.fallbackUsed,
          attemptCount: request.attemptCount,
          totalLatencyMs: request.totalLatencyMs,
          totalTokens: request.totalTokens,
          estimatedCost: Number(request.estimatedCost),
          errorCategory: request.errorCategory,
          errorMessage: request.errorMessage,
          routeExplanation: request.routeExplanation,
          traceStages: request.traceStages,
          attempts: request.attempts.map((attempt) => ({
            sequence: attempt.sequence,
            status: attempt.status,
            modelLabel: attempt.modelLabel,
            providerKind: attempt.providerKind,
            errorCategory: attempt.errorCategory,
            errorMessage: attempt.errorMessage,
            latencyMs: attempt.latencyMs,
            reason: attempt.reason,
          })),
        }
      : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-800 px-5 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Link href="/" aria-label="OmniRouter home">
            <OmniRouterWordmark />
          </Link>
          <div className="flex items-center gap-2">
            <Badge tone="warning">Demo data</Badge>
            <Link
              href="/login"
              className="rounded-lg border border-base-600 bg-base-800 px-3 py-1.5 text-xs text-ink-50 hover:bg-base-700"
            >
              Open the dashboard
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-8">
          <Badge tone="primary">Client story mode</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50">
            A provider fails. Your product does not.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-400">
            Six steps, about a minute. Every figure below is read from real
            requests this deployment executed through its own gateway — not from
            a script or a screenshot.
          </p>
        </div>

        <StoryPlayer
          normal={serialise(normal)}
          fallback={serialise(fallback)}
          failure={serialise(failure)}
          summary={{ applications, policies, models, requestCount }}
        />
      </main>

      <footer className="border-t border-base-800 px-5 py-8">
        <div className="mx-auto max-w-5xl">
          <Panel className="p-6">
            <h2 className="text-sm font-semibold text-ink-50">
              What you just watched
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-400">
              A request entered one endpoint. A policy chose a model and recorded
              why, including the candidates it rejected. The chosen provider
              stalled, the failure was classified as a timeout, the retry policy
              for that class was applied, and when the primary target kept
              failing the request moved to a different model and succeeded. The
              caller received a normal response and a correlation id. Everything
              else was recorded for whoever has to explain it later.
            </p>
            <p className="mt-3 text-[11px] text-ink-600">
              OmniRouter AI — a portfolio project by Arslan Vuzmal Lone. The
              models in this demonstration are fictional and run in-process; no
              request leaves this deployment.
            </p>
          </Panel>
        </div>
      </footer>
    </div>
  );
}
