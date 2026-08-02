'use client';

import { AlertTriangle, ExternalLink, Play, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/primitives';
import {
  Button,
  Field,
  Panel,
  PanelHeader,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { formatCost } from '@/lib/ai/pricing';
import { formatLatency } from '@/lib/utils';

import {
  runComparisonAction,
  runPlaygroundAction,
  type PlaygroundResult,
} from './actions';

interface ApplicationOption {
  id: string;
  name: string;
  environments: Array<{ id: string; type: string }>;
}

interface PolicyOption {
  id: string;
  name: string;
  strategy: string;
}

const SIMULATIONS = [
  { value: 'none', label: 'No simulation — normal request' },
  { value: 'timeout', label: 'Primary provider timeout' },
  { value: 'rate_limit', label: 'Primary provider rate limit (429)' },
  { value: 'unavailable', label: 'Primary provider unavailable (503)' },
  { value: 'malformed', label: 'Malformed provider response' },
  { value: 'auth_failure', label: 'Misconfigured credential (401)' },
  { value: 'safety_refusal', label: 'Safety refusal' },
];

export function PlaygroundClient({
  applications,
  policies,
  canExecute,
}: {
  applications: ApplicationOption[];
  policies: PolicyOption[];
  canExecute: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const [applicationId, setApplicationId] = useState(applications[0]?.id ?? '');
  const application = applications.find((a) => a.id === applicationId);
  const [environmentId, setEnvironmentId] = useState(
    applications[0]?.environments[0]?.id ?? '',
  );
  const [policyId, setPolicyId] = useState('');
  const [comparePolicyId, setComparePolicyId] = useState(policies[1]?.id ?? '');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a concise support operations assistant.',
  );
  const [userPrompt, setUserPrompt] = useState(
    'Summarise this support thread and suggest the next action for the agent.',
  );
  const [simulate, setSimulate] = useState('none');
  const [structuredOutput, setStructuredOutput] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const [results, setResults] = useState<PlaygroundResult[]>([]);

  function buildInput(overridePolicy?: string) {
    return {
      applicationId,
      environmentId,
      policyId: overridePolicy || policyId || null,
      systemPrompt: systemPrompt || undefined,
      userPrompt,
      maxTokens: 400,
      structuredOutput,
      simulate,
    };
  }

  function run() {
    startTransition(async () => {
      if (compareMode) {
        const next = await runComparisonAction([
          buildInput(policyId),
          buildInput(comparePolicyId),
        ]);
        setResults(next);
      } else {
        setResults([await runPlaygroundAction(buildInput())]);
      }
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      {/* Configuration */}
      <Panel className="h-fit">
        <PanelHeader
          title="Configuration"
          description="Requests run through the same gateway the public API uses."
        />
        <div className="space-y-4 px-5 py-4">
          <Field label="Application" htmlFor="pg-application">
            <Select
              id="pg-application"
              value={applicationId}
              onChange={(event) => {
                const next = event.target.value;
                setApplicationId(next);
                const app = applications.find((a) => a.id === next);
                setEnvironmentId(app?.environments[0]?.id ?? '');
              }}
            >
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Environment" htmlFor="pg-environment">
            <Select
              id="pg-environment"
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
            >
              {(application?.environments ?? []).map((env) => (
                <option key={env.id} value={env.id}>
                  {env.type === 'PRODUCTION' ? 'Production' : 'Development'}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Routing policy"
            htmlFor="pg-policy"
            hint="Leave as default to use the environment's configured policy."
          >
            <Select
              id="pg-policy"
              value={policyId}
              onChange={(event) => setPolicyId(event.target.value)}
            >
              <option value="">Environment default</option>
              {policies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.name} · {policy.strategy}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="System prompt" htmlFor="pg-system">
            <Textarea
              id="pg-system"
              rows={3}
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </Field>

          <Field label="User message" htmlFor="pg-user">
            <Textarea
              id="pg-user"
              rows={5}
              value={userPrompt}
              onChange={(event) => setUserPrompt(event.target.value)}
              required
            />
          </Field>

          <Field
            label="Failure simulation"
            htmlFor="pg-simulate"
            hint="Injects a fault into the primary target so you can watch the fallback engine react."
          >
            <Select
              id="pg-simulate"
              value={simulate}
              onChange={(event) => setSimulate(event.target.value)}
            >
              {SIMULATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="space-y-2.5 border-t border-base-800 pt-3.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink-200">
              <input
                type="checkbox"
                checked={structuredOutput}
                onChange={(event) => setStructuredOutput(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-base-600 bg-base-850"
              />
              Require structured JSON output
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink-200">
              <input
                type="checkbox"
                checked={compareMode}
                onChange={(event) => setCompareMode(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-base-600 bg-base-850"
              />
              Comparison mode — run two policies side by side
            </label>
          </div>

          {compareMode ? (
            <Field label="Compare against" htmlFor="pg-compare">
              <Select
                id="pg-compare"
                value={comparePolicyId}
                onChange={(event) => setComparePolicyId(event.target.value)}
              >
                {policies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} · {policy.strategy}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              onClick={run}
              disabled={pending || !canExecute || !userPrompt.trim()}
              className="flex-1"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {pending ? 'Running…' : compareMode ? 'Run comparison' : 'Run'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setResults([])}
              disabled={pending || results.length === 0}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Clear results</span>
            </Button>
          </div>

          {!canExecute ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning-400/30 bg-warning-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-warning-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Your role is read-only. Running a request requires developer access or above
              — and the restriction is enforced on the server, not by disabling this
              button.
            </p>
          ) : null}
        </div>
      </Panel>

      {/* Results */}
      <div className="space-y-5">
        {results.length === 0 ? (
          <Panel className="flex min-h-64 items-center justify-center p-8">
            <div className="text-center">
              <h3 className="text-sm font-semibold text-ink-200">No result yet</h3>
              <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-400">
                Run a request to see the response, the route that was chosen and the
                attempts it took. Try a failure simulation to watch the fallback engine
                recover.
              </p>
            </div>
          </Panel>
        ) : (
          <div className={results.length > 1 ? 'grid gap-5 lg:grid-cols-2' : 'space-y-5'}>
            {results.map((result, index) => (
              <ResultPanel
                key={result.correlationId ?? index}
                result={result}
                label={
                  results.length > 1
                    ? `Configuration ${String.fromCharCode(65 + index)}`
                    : 'Result'
                }
              />
            ))}
          </div>
        )}

        {results.length > 1 ? (
          <p className="text-[11px] leading-relaxed text-ink-600">
            Demonstration comparison using configured demo behaviour. These are not
            independent model benchmarks, and the figures reflect this workspace&apos;s
            configured pricing and the demo provider&apos;s simulated latency.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ResultPanel({ result, label }: { result: PlaygroundResult; label: string }) {
  if (result.error) {
    return (
      <Panel className="border-danger-400/30">
        <PanelHeader title={label} />
        <p className="px-5 py-4 text-xs text-danger-400">{result.error}</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title={label}
        description={result.routingReason}
        actions={
          result.requestId ? (
            <Link href={`/dashboard/requests/${result.requestId}`}>
              <Button size="sm" variant="ghost">
                Trace
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="space-y-3.5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={result.ok ? 'success' : 'danger'}>
            {result.status?.toLowerCase()}
          </Badge>
          {result.fallbackUsed ? <Badge tone="warning">fallback</Badge> : null}
          {result.model ? <Badge tone="primary">{result.model}</Badge> : null}
          {result.strategy ? <Badge tone="accent">{result.strategy}</Badge> : null}
          {result.structuredValid !== null && result.structuredValid !== undefined ? (
            <Badge tone={result.structuredValid ? 'success' : 'danger'}>
              {result.structuredValid ? 'valid JSON' : 'invalid JSON'}
            </Badge>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Latency" value={formatLatency(result.latencyMs ?? 0)} />
          <Metric label="Attempts" value={String(result.attemptCount ?? 0)} />
          <Metric
            label="Tokens"
            value={`${result.inputTokens ?? 0} / ${result.outputTokens ?? 0}`}
          />
          <Metric label="Est. cost" value={formatCost(result.estimatedCost ?? 0)} />
        </dl>

        {result.content ? (
          <div>
            <h4 className="text-[10px] font-semibold tracking-wide text-ink-400 uppercase">
              Response
            </h4>
            <pre className="mt-1.5 max-h-72 overflow-auto rounded-lg border border-base-700 bg-base-850 p-3.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-200">
              {result.content}
            </pre>
          </div>
        ) : null}

        {result.errorMessage ? (
          <div className="rounded-lg border border-danger-400/25 bg-danger-400/8 px-3.5 py-2.5">
            <p className="text-[10px] font-semibold tracking-wide text-danger-400 uppercase">
              {result.errorCategory}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-danger-400">
              {result.errorMessage}
            </p>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-ink-600 uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs tabular-nums text-ink-50">{value}</dd>
    </div>
  );
}
