'use client';

import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Button, Panel, PanelHeader, Stat } from '@/components/ui/primitives';
import { formatCost } from '@/lib/ai/pricing';
import type { RouteExplanation } from '@/lib/ai/routing/types';
import { cn, formatLatency } from '@/lib/utils';

interface StoryAttempt {
  sequence: number;
  status: string;
  modelLabel: string;
  providerKind: string;
  errorCategory: string | null;
  errorMessage: string | null;
  latencyMs: number;
  reason: string | null;
}

interface StoryRequest {
  id: string;
  correlationId: string;
  status: string;
  resolvedModel: string | null;
  fallbackUsed: boolean;
  attemptCount: number;
  totalLatencyMs: number;
  totalTokens: number;
  estimatedCost: number;
  errorCategory: string | null;
  errorMessage: string | null;
  routeExplanation: unknown;
  traceStages: unknown;
  attempts: StoryAttempt[];
}

interface Summary {
  applications: number;
  policies: number;
  models: number;
  requestCount: number;
}

export function StoryPlayer({
  normal,
  fallback,
  failure,
  summary,
}: {
  normal: StoryRequest | null;
  fallback: StoryRequest | null;
  failure: StoryRequest | null;
  summary: Summary;
}) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'An application, isolated by design',
      body: 'A business connects its AI product to OmniRouter as an application, with separate development and production environments. Each environment issues its own virtual API keys, so a development key can never address production traffic.',
      render: () => (
        <dl className="grid gap-3 sm:grid-cols-4">
          <Stat label="Applications" value={summary.applications} />
          <Stat label="Routing policies" value={summary.policies} />
          <Stat label="Models catalogued" value={summary.models} />
          <Stat label="Requests recorded" value={summary.requestCount} />
        </dl>
      ),
    },
    {
      title: 'A policy decides — and says why',
      body: 'A balanced policy scores each candidate on health, recent success rate, latency and cost. The decision is stored on the request, so it stays readable after the policy has been edited.',
      render: () => (normal ? <ExplanationCard request={normal} /> : <Missing />),
    },
    {
      title: 'A normal request',
      body: 'The selected model responds. The caller gets a response and a correlation id; the platform records tokens, latency and an estimated cost derived from the pricing configured on that model.',
      render: () => (normal ? <RequestCard request={normal} /> : <Missing />),
    },
    {
      title: 'The provider stalls',
      body: 'The primary target stops responding. The failure is classified as a timeout, and the retry policy for that class allows exactly one retry against the same target before moving on — because a second retry risks duplicating work that may already be running.',
      render: () =>
        fallback ? <AttemptStrip attempts={fallback.attempts} /> : <Missing />,
    },
    {
      title: 'The fallback succeeds',
      body: 'With the primary target exhausted, the request moves to the next model in the ranked chain and completes. The caller never sees the failure — but an operator can see every attempt it took.',
      render: () => (fallback ? <RequestCard request={fallback} /> : <Missing />),
    },
    {
      title: 'Some failures should not be routed around',
      body: 'Not every failure deserves a fallback. A safety refusal is returned to the caller rather than shopped to another provider until one answers — that is a deliberate policy decision, not an oversight.',
      render: () => (failure ? <RequestCard request={failure} /> : <Missing />),
    },
  ];

  const current = steps[step];
  if (!current) return null;

  return (
    <div className="space-y-5">
      {/* Progress */}
      <ol className="flex flex-wrap gap-1.5" aria-label="Walkthrough progress">
        {steps.map((entry, index) => (
          <li key={entry.title} className="flex-1">
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'h-1.5 w-full rounded-full transition-colors',
                index === step
                  ? 'bg-primary-400'
                  : index < step
                    ? 'bg-primary-500/40'
                    : 'bg-base-700 hover:bg-base-600',
              )}
            >
              <span className="sr-only">
                Step {index + 1}: {entry.title}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-500/15 font-mono text-[10px] text-primary-300">
                {step + 1}
              </span>
              {current.title}
            </span>
          }
          description={current.body}
          as="h2"
        />
        <div className="px-5 py-5">{current.render()}</div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>

        <span className="text-xs text-ink-600">
          Step {step + 1} of {steps.length}
        </span>

        {step < steps.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
          >
            Next
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Link href="/login">
            <Button variant="primary">
              Explore the dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

function Missing() {
  return (
    <p className="text-xs text-ink-600">
      No seeded request of this kind is available. Run the demo seed to populate it.
    </p>
  );
}

function RequestCard({ request }: { request: StoryRequest }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={request.status === 'SUCCEEDED' ? 'success' : 'danger'}>
          {request.status.toLowerCase()}
        </Badge>
        {request.fallbackUsed ? <Badge tone="warning">fallback</Badge> : null}
        {request.resolvedModel ? (
          <Badge tone="primary">{request.resolvedModel}</Badge>
        ) : null}
        {request.errorCategory ? (
          <Badge tone="danger">{request.errorCategory}</Badge>
        ) : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        <Stat label="Latency" value={formatLatency(request.totalLatencyMs)} />
        <Stat
          label="Attempts"
          value={request.attemptCount}
          tone={request.attemptCount > 1 ? 'warning' : 'neutral'}
        />
        <Stat label="Tokens" value={request.totalTokens} />
        <Stat label="Est. cost" value={formatCost(request.estimatedCost)} />
      </dl>

      {request.errorMessage ? (
        <p className="rounded-lg border border-danger-400/25 bg-danger-400/8 px-3.5 py-2.5 text-[11px] leading-relaxed text-danger-400">
          {request.errorMessage}
        </p>
      ) : null}

      <AttemptStrip attempts={request.attempts} />

      <Link
        href={`/dashboard/requests/${request.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:underline"
      >
        Open the full trace
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function AttemptStrip({ attempts }: { attempts: StoryAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <p className="text-xs text-ink-600">
        No provider attempt was made for this request.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {attempts.map((attempt) => {
        const ok = attempt.status === 'SUCCEEDED';

        return (
          <li
            key={attempt.sequence}
            className={cn(
              'flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-2.5',
              ok
                ? 'border-success-400/30 bg-success-400/8'
                : 'border-danger-400/30 bg-danger-400/8',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                ok
                  ? 'bg-success-400/20 text-success-400'
                  : 'bg-danger-400/20 text-danger-400',
              )}
            >
              {ok ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <X className="h-3 w-3" aria-hidden="true" />
              )}
            </span>

            <span className="font-mono text-xs text-ink-50">{attempt.modelLabel}</span>

            <Badge tone={ok ? 'success' : 'danger'}>
              {attempt.errorCategory ?? attempt.status.toLowerCase()}
            </Badge>

            <span className="ml-auto font-mono text-xs tabular-nums text-ink-400">
              {formatLatency(attempt.latencyMs)}
            </span>

            {attempt.reason ? (
              <span className="w-full text-[10px] leading-relaxed text-ink-600">
                {attempt.reason}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ExplanationCard({ request }: { request: StoryRequest }) {
  const explanation = request.routeExplanation as RouteExplanation | null;

  if (!explanation) return <Missing />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{explanation.strategy}</Badge>
        <span className="text-xs text-ink-400">{explanation.policyName}</span>
      </div>

      <p className="text-sm leading-relaxed text-ink-200">{explanation.reason}</p>

      {explanation.scoreBreakdown.length > 0 ? (
        <ul className="space-y-2">
          {explanation.scoreBreakdown.map((entry, index) => (
            <li
              key={entry.modelId}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5',
                index === 0
                  ? 'border-primary-500/35 bg-primary-500/8'
                  : 'border-base-700 bg-base-850',
              )}
            >
              <span className="font-mono text-xs text-ink-200">{entry.modelLabel}</span>
              <span className="flex items-center gap-2.5">
                {index === 0 ? <Badge tone="primary">selected</Badge> : null}
                <span className="font-mono text-xs tabular-nums text-primary-300">
                  {entry.score.toFixed(3)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {explanation.rejectedCandidates.length > 0 ? (
        <div>
          <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            Why the others were not used
          </h4>
          <ul className="mt-1.5 space-y-1">
            {explanation.rejectedCandidates.slice(0, 4).map((candidate) => (
              <li
                key={`${candidate.modelId}-${candidate.reason}`}
                className="text-[11px] leading-relaxed text-ink-600"
              >
                <span className="font-mono text-ink-400">{candidate.modelLabel}</span> —{' '}
                {candidate.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
