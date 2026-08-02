import { AlertTriangle, Check, CircleSlash, X } from 'lucide-react';

import { AttemptStatusBadge, ErrorBadge } from '@/components/dashboard/status';
import { Badge, Panel, PanelHeader } from '@/components/ui/primitives';
import type { TraceStage } from '@/lib/ai/gateway';
import type { RouteExplanation } from '@/lib/ai/routing/types';
import type {
  AttemptStatus,
  ErrorCategory,
  ProviderKind,
} from '@/lib/database/generated/enums';
import { formatCost } from '@/lib/ai/pricing';
import { cn, formatLatency } from '@/lib/utils';

/**
 * Request trace.
 *
 * Renders the persisted lifecycle stages and provider attempts as a vertical
 * timeline. The failed attempts matter as much as the successful one — showing
 * only the winner would hide exactly the behaviour an operator is here to
 * understand.
 */

const STAGE_ICON: Record<TraceStage['status'], typeof Check> = {
  ok: Check,
  warn: AlertTriangle,
  error: X,
  skipped: CircleSlash,
};

const STAGE_STYLES: Record<TraceStage['status'], string> = {
  ok: 'border-success-400/40 bg-success-400/10 text-success-400',
  warn: 'border-warning-400/40 bg-warning-400/10 text-warning-400',
  error: 'border-danger-400/40 bg-danger-400/10 text-danger-400',
  skipped: 'border-base-600 bg-base-800 text-ink-600',
};

export function TraceTimeline({ stages }: { stages: TraceStage[] }) {
  if (stages.length === 0) {
    return (
      <p className="px-5 py-4 text-xs text-ink-600">
        No trace stages were recorded for this request.
      </p>
    );
  }

  return (
    <ol className="relative px-5 py-4">
      {stages.map((stage, index) => {
        const Icon = STAGE_ICON[stage.status];
        const isLast = index === stages.length - 1;

        return (
          <li key={`${stage.key}-${index}`} className="relative flex gap-3.5 pb-5">
            {/* Connector between markers */}
            {!isLast ? (
              <span
                aria-hidden="true"
                className="absolute top-7 left-[13px] h-full w-px bg-base-700"
              />
            ) : null}

            <span
              className={cn(
                'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                STAGE_STYLES[stage.status],
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-ink-50">{stage.label}</h3>
                <span className="font-mono text-[11px] tabular-nums text-ink-600">
                  +{stage.durationMs} ms
                </span>
              </div>

              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                {stage.detail}
              </p>

              {stage.metadata ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.entries(stage.metadata).map(([key, value]) => (
                    <span
                      key={key}
                      className="rounded border border-base-700 bg-base-850 px-1.5 py-0.5 font-mono text-[10px] text-ink-400"
                    >
                      {key}: {String(value)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface AttemptView {
  id: string;
  sequence: number;
  status: AttemptStatus;
  providerKind: ProviderKind;
  modelLabel: string;
  errorCategory: ErrorCategory | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  providerRequestId: string | null;
  reason: string | null;
}

export function AttemptList({ attempts }: { attempts: AttemptView[] }) {
  if (attempts.length === 0) {
    return (
      <p className="px-5 py-4 text-xs text-ink-600">
        No provider attempt was made — the request was rejected before dispatch.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-base-800">
      {attempts.map((attempt) => (
        <li key={attempt.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-base-700 font-mono text-[10px] text-ink-200">
                {attempt.sequence}
              </span>
              <span className="font-mono text-xs text-ink-50">{attempt.modelLabel}</span>
              <Badge tone="neutral">{attempt.providerKind}</Badge>
              <AttemptStatusBadge status={attempt.status} />
              {attempt.errorCategory ? (
                <ErrorBadge category={attempt.errorCategory} />
              ) : null}
            </div>

            <span className="font-mono text-xs tabular-nums text-ink-400">
              {formatLatency(attempt.latencyMs)}
            </span>
          </div>

          {attempt.reason ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              {attempt.reason}
            </p>
          ) : null}

          {attempt.errorMessage ? (
            <p className="mt-1.5 rounded border border-danger-400/25 bg-danger-400/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-danger-400">
              {attempt.errorMessage}
            </p>
          ) : null}

          {attempt.status === 'SUCCEEDED' ? (
            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
              <div className="flex gap-1.5">
                <dt className="text-ink-600">Input</dt>
                <dd className="font-mono tabular-nums text-ink-200">
                  {attempt.inputTokens.toLocaleString()}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-600">Output</dt>
                <dd className="font-mono tabular-nums text-ink-200">
                  {attempt.outputTokens.toLocaleString()}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-600">Estimated cost</dt>
                <dd className="font-mono tabular-nums text-ink-200">
                  {formatCost(attempt.estimatedCost)}
                </dd>
              </div>
              {attempt.providerRequestId ? (
                <div className="flex gap-1.5">
                  <dt className="text-ink-600">Provider id</dt>
                  <dd className="font-mono text-ink-400">{attempt.providerRequestId}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Routing decision.
 *
 * The rejected candidates are given equal visual weight to the selected one.
 * That is the point of the screen: understanding why the others were dropped is
 * usually more useful than knowing which one won.
 */
export function RouteExplanationView({ explanation }: { explanation: RouteExplanation }) {
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{explanation.strategy}</Badge>
        <span className="text-xs text-ink-400">{explanation.policyName}</span>
      </div>

      <p className="text-xs leading-relaxed text-ink-200">{explanation.reason}</p>

      {explanation.selectedCandidate ? (
        <div className="rounded-lg border border-primary-500/30 bg-primary-500/8 px-3.5 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-primary-300 uppercase">
            Selected
          </p>
          <p className="mt-1 font-mono text-xs text-ink-50">
            {explanation.selectedCandidate.modelLabel}
            <span className="ml-2 text-ink-600">
              {explanation.selectedCandidate.providerKind}
            </span>
          </p>
        </div>
      ) : null}

      {explanation.scoreBreakdown.length > 0 ? (
        <div>
          <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            Score breakdown
          </h4>
          <div className="mt-2 space-y-2.5">
            {explanation.scoreBreakdown.map((entry) => (
              <div
                key={entry.modelId}
                className="rounded-lg border border-base-700 bg-base-850 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-ink-200">
                    {entry.modelLabel}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-primary-300">
                    {entry.score.toFixed(3)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {entry.components.map((component) => (
                    <span
                      key={component.factor}
                      className="font-mono text-[10px] text-ink-600"
                    >
                      {component.factor}{' '}
                      <span className="text-ink-400">
                        {component.normalised.toFixed(2)}
                      </span>
                      <span className="text-ink-600">
                        ×{component.weight} = {component.contribution.toFixed(3)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-ink-600">
            Selected according to the configured scoring policy. These weights express a
            workspace preference; they do not identify an objectively best model.
          </p>
        </div>
      ) : null}

      {explanation.rejectedCandidates.length > 0 ? (
        <div>
          <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            Candidates not selected
          </h4>
          <ul className="mt-2 space-y-1.5">
            {explanation.rejectedCandidates.map((candidate) => (
              <li
                key={`${candidate.modelId}-${candidate.reason}`}
                className="rounded-lg border border-base-700 bg-base-850 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-200">
                    {candidate.modelLabel}
                  </span>
                  <Badge
                    tone={candidate.reason === 'not_selected' ? 'neutral' : 'warning'}
                  >
                    {candidate.reason.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-ink-600">
                  {candidate.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {explanation.fallbackOrder.length > 0 ? (
        <div>
          <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
            Fallback order
          </h4>
          <p className="mt-1.5 font-mono text-[11px] text-ink-400">
            {explanation.fallbackOrder.join(' → ')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function TracePanels({
  stages,
  attempts,
  explanation,
}: {
  stages: TraceStage[];
  attempts: AttemptView[];
  explanation: RouteExplanation | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <Panel>
          <PanelHeader
            title="Lifecycle"
            description="Each stage the request passed through, with the time it took."
          />
          <TraceTimeline stages={stages} />
        </Panel>

        <Panel>
          <PanelHeader
            title="Provider attempts"
            description="Every attempt is recorded, including those that failed and were replaced."
          />
          <AttemptList attempts={attempts} />
        </Panel>
      </div>

      <Panel className="h-fit">
        <PanelHeader
          title="Routing decision"
          description="Stored at the time of the request, so it stays readable after the policy changes."
        />
        {explanation ? (
          <RouteExplanationView explanation={explanation} />
        ) : (
          <p className="px-5 py-4 text-xs text-ink-600">
            No routing explanation was recorded for this request.
          </p>
        )}
      </Panel>
    </div>
  );
}
