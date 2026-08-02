import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/database/client';
import type {
  EnvironmentType,
  ErrorCategory,
  RequestStatus,
} from '@/lib/database/generated/enums';
import { decryptSecret } from '@/lib/encryption/crypto';
import { evaluateQuotas, recordUsage } from '@/lib/quotas/engine';

import { buildNormalisedError, safeMessageFor } from './errors';
import type { AttemptRecord } from './fallback/executor';
import { executeWithFallback } from './fallback/executor';
import { projectCost } from './pricing';
import { getProvider, PROVIDER_ENV_KEYS } from './providers';
import { evaluateRoute } from './routing/engine';
import type {
  RouteCandidate,
  RouteExplanation,
  RouteRequirements,
  ScoringWeights,
} from './routing/types';
import { DEFAULT_SCORING_WEIGHTS } from './routing/types';
import { estimateMessagesTokens } from './tokens';
import type {
  Capability,
  ChatMessage,
  CompletionRequest,
  DemoBehaviour,
  ProviderContext,
} from './types';

/**
 * The gateway: one request lifecycle, start to finish.
 *
 * This is the single execution path. The playground, Client Story Mode and the
 * public /api/v1 endpoint all call `runCompletion`, so a demonstration is
 * evidence about the same code that serves production traffic rather than a
 * parallel mock.
 */

/** Ordered lifecycle stages persisted on the request for the trace viewer. */
export interface TraceStage {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error' | 'skipped';
  startedAt: string;
  durationMs: number;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface RunCompletionInput {
  workspaceId: string;
  applicationId: string;
  environmentId: string;
  environmentType: EnvironmentType;
  apiKeyId: string | null;
  policyId: string | null;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  requestedModelId?: string;
  structuredOutputSchema?: Record<string, unknown>;
  requiredCapabilities?: Capability[];
  /** Fault injection for demonstrations. Only the demo provider honours these. */
  demoBehaviour?: DemoBehaviour;
  /**
   * How widely the injected fault applies.
   *
   *  'all'             — every attempt fails; demonstrates terminal failure.
   *  'first_attempt'   — only the opening call fails; demonstrates a same-target
   *                      retry succeeding.
   *  'first_candidate' — every attempt against the primary target fails, so the
   *                      chain exhausts its retries and genuinely moves to a
   *                      different model. This is what produces a real fallback.
   */
  demoBehaviourScope?: 'all' | 'first_attempt' | 'first_candidate';
  idempotencyKey?: string | null;
  source?: string;
}

export interface RunCompletionResult {
  correlationId: string;
  requestDbId: string;
  status: RequestStatus;
  content: string | null;
  finishReason: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  estimatedCost: number;
  latencyMs: number;
  model: string | null;
  provider: string | null;
  fallbackUsed: boolean;
  attempts: AttemptRecord[];
  explanation: RouteExplanation;
  traceStages: TraceStage[];
  errorCategory: ErrorCategory | null;
  errorMessage: string | null;
  quotaWarning: string | null;
}

/** Recent-window size used to derive latency and success-rate signals. */
const SIGNAL_WINDOW = 50;

class StageRecorder {
  private readonly stages: TraceStage[] = [];
  private cursor = Date.now();

  add(
    key: string,
    label: string,
    status: TraceStage['status'],
    detail: string,
    metadata?: Record<string, unknown>,
  ): void {
    const now = Date.now();
    this.stages.push({
      key,
      label,
      status,
      startedAt: new Date(this.cursor).toISOString(),
      durationMs: now - this.cursor,
      detail,
      metadata,
    });
    this.cursor = now;
  }

  all(): TraceStage[] {
    return this.stages;
  }
}

/**
 * Loads candidates for a policy, joining in the recent performance signals the
 * latency- and reliability-aware strategies score on.
 */
async function loadCandidates(
  workspaceId: string,
  policyId: string | null,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): Promise<RouteCandidate[]> {
  const rules = policyId
    ? await prisma.routingRule.findMany({
        where: { policyId, enabled: true },
        include: { model: { include: { connection: true } } },
        orderBy: { priority: 'asc' },
      })
    : [];

  // With no policy, every available model in the workspace is a candidate.
  const models = policyId
    ? rules.map((rule) => ({
        model: rule.model,
        priority: rule.priority,
        weight: rule.weight,
      }))
    : (
        await prisma.modelDefinition.findMany({
          where: { workspaceId, isAvailable: true },
          include: { connection: true },
        })
      ).map((model) => ({ model, priority: 1, weight: 1 }));

  if (models.length === 0) return [];

  const modelIds = models.map((entry) => entry.model.id);

  // One grouped query for all candidates rather than a query per model.
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
    { successes: number; failures: number; latencySum: number; latencyCount: number }
  >();

  for (const row of recent) {
    if (!row.modelId) continue;

    const entry = signals.get(row.modelId) ?? {
      successes: 0,
      failures: 0,
      latencySum: 0,
      latencyCount: 0,
    };

    if (row.status === 'SUCCEEDED') {
      entry.successes += row._count._all;
      entry.latencySum += (row._avg.latencyMs ?? 0) * row._count._all;
      entry.latencyCount += row._count._all;
    } else if (row.status !== 'SKIPPED') {
      entry.failures += row._count._all;
    }

    signals.set(row.modelId, entry);
  }

  return models.map(({ model, priority, weight }) => {
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
      priority,
      weight,
      contextWindow: model.contextWindow,
      capabilities,
      inputPricePerMillion: inputPrice,
      outputPricePerMillion: outputPrice,
      projectedCost: projectCost(estimatedInputTokens, estimatedOutputTokens, {
        inputPricePerMillion: inputPrice,
        outputPricePerMillion: outputPrice,
      }),
      healthState: model.healthState,
      recentLatencyMs:
        signal && signal.latencyCount > 0
          ? signal.latencySum / signal.latencyCount
          : null,
      recentSuccessRate: total >= 1 ? (signal?.successes ?? 0) / total : null,
      recentSampleSize: Math.min(total, SIGNAL_WINDOW),
      isAvailable: model.isAvailable && model.connection.status === 'ACTIVE',
      isDemoModel: model.isDemoModel,
    } satisfies RouteCandidate;
  });
}

/** Resolves the decrypted credential for a connection, if it has one. */
async function resolveCredential(
  connectionId: string,
): Promise<{ apiKey?: string; baseUrl?: string }> {
  const connection = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
    select: { kind: true, credentialCiphertext: true, baseUrl: true },
  });

  if (!connection) return {};

  let apiKey: string | undefined;

  if (connection.credentialCiphertext) {
    try {
      apiKey = decryptSecret(connection.credentialCiphertext);
    } catch {
      // A credential that cannot be decrypted is treated as absent; the adapter
      // then raises AUTHENTICATION, which flags the connection for an admin.
      apiKey = undefined;
    }
  }

  if (!apiKey) {
    // Fall back to a process-level key when one is configured for this provider.
    const envKey = PROVIDER_ENV_KEYS[connection.kind];
    if (envKey) apiKey = process.env[envKey];
  }

  return { apiKey, baseUrl: connection.baseUrl ?? undefined };
}

export async function runCompletion(
  input: RunCompletionInput,
): Promise<RunCompletionResult> {
  const correlationId = randomUUID();
  const stages = new StageRecorder();
  const startedAt = Date.now();

  stages.add(
    'authenticated',
    'Authenticated',
    'ok',
    input.apiKeyId
      ? 'Virtual API key validated and resolved to an application and environment.'
      : 'Authenticated by dashboard session.',
  );

  // --- Quotas -------------------------------------------------------------
  const quota = await evaluateQuotas({
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    environmentId: input.environmentId,
  });

  if (!quota.allowed) {
    stages.add(
      'quota',
      'Quota check',
      'error',
      quota.detail ?? 'A configured quota rejected this request.',
    );

    return persistRejection({
      input,
      correlationId,
      stages,
      category: 'QUOTA_EXCEEDED',
      message: quota.detail ?? safeMessageFor('QUOTA_EXCEEDED'),
      startedAt,
    });
  }

  stages.add(
    'quota',
    'Quota check',
    quota.warning ? 'warn' : 'ok',
    quota.detail ?? 'Within all configured quotas.',
  );

  // --- Routing ------------------------------------------------------------
  const estimatedInputTokens = estimateMessagesTokens(input.messages);
  const estimatedOutputTokens = input.maxTokens ?? 512;

  const policy = input.policyId
    ? await prisma.routingPolicy.findFirst({
        where: { id: input.policyId, workspaceId: input.workspaceId },
      })
    : null;

  const candidates = await loadCandidates(
    input.workspaceId,
    policy?.id ?? null,
    estimatedInputTokens,
    estimatedOutputTokens,
  );

  const requirements: RouteRequirements = {
    capabilities: [
      ...(input.requiredCapabilities ?? []),
      ...(input.structuredOutputSchema ? (['structured_output'] as Capability[]) : []),
    ],
    minContextWindow: estimatedInputTokens + estimatedOutputTokens,
    maxEstimatedCost:
      policy?.maxEstimatedCost === null || policy?.maxEstimatedCost === undefined
        ? null
        : Number(policy.maxEstimatedCost),
    pinnedModelId: input.requestedModelId,
  };

  const weights: ScoringWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    ...((policy?.scoring as Partial<ScoringWeights> | null) ?? {}),
  };

  const route = evaluateRoute({
    policyId: policy?.id ?? null,
    policyName: policy?.name ?? 'Ad-hoc selection',
    strategy: input.requestedModelId ? 'MANUAL' : (policy?.strategy ?? 'BALANCED'),
    candidates,
    requirements,
    weights,
  });

  stages.add(
    'routing',
    'Policy evaluated',
    route.selected ? 'ok' : 'error',
    route.explanation.reason,
    {
      candidateCount: candidates.length,
      rejectedCount: route.explanation.rejectedCandidates.length,
      strategy: route.explanation.strategy,
    },
  );

  if (!route.selected) {
    return persistRejection({
      input,
      correlationId,
      stages,
      category: 'INVALID_REQUEST',
      message: route.explanation.reason,
      startedAt,
      explanation: route.explanation,
    });
  }

  // --- Execution ----------------------------------------------------------
  const chain = [route.selected, ...route.fallbackChain];
  const credentialCache = new Map<string, { apiKey?: string; baseUrl?: string }>();

  for (const candidate of chain) {
    if (!credentialCache.has(candidate.connectionId)) {
      credentialCache.set(
        candidate.connectionId,
        await resolveCredential(candidate.connectionId),
      );
    }
  }

  const completionRequest: CompletionRequest = {
    messages: input.messages,
    model: route.selected.modelLabel,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    structuredOutputSchema: input.structuredOutputSchema,
  };

  let invocationIndex = 0;
  const primaryModelId = route.selected.modelId;

  const execution = await executeWithFallback({
    request: completionRequest,
    chain,
    maxAttempts: policy?.maxAttempts ?? 3,
    attemptTimeoutMs: policy?.attemptTimeoutMs ?? 30_000,
    totalTimeoutMs: policy?.totalTimeoutMs ?? 60_000,
    correlationId,
    buildContext: (candidate, timeoutMs): ProviderContext => {
      const credential = credentialCache.get(candidate.connectionId) ?? {};

      const scope = input.demoBehaviourScope ?? 'all';
      const applyFault =
        Boolean(input.demoBehaviour) &&
        (scope === 'all' ||
          (scope === 'first_attempt' && invocationIndex === 0) ||
          (scope === 'first_candidate' && candidate.modelId === primaryModelId));

      return {
        apiKey: credential.apiKey,
        baseUrl: credential.baseUrl,
        timeoutMs,
        correlationId,
        demoBehaviour: applyFault ? input.demoBehaviour : undefined,
      };
    },
    invoke: async (candidate, request, context) => {
      invocationIndex += 1;
      const adapter = getProvider(candidate.providerKind);
      return adapter.chatCompletion({ ...request, model: candidate.modelLabel }, context);
    },
    classify: (candidate, error) => {
      const adapter = getProvider(candidate.providerKind);
      return adapter.normaliseError(error);
    },
  });

  for (const attempt of execution.attempts) {
    stages.add(
      `attempt-${attempt.sequence}`,
      `Attempt ${attempt.sequence}: ${attempt.modelLabel}`,
      attempt.status === 'SUCCEEDED' ? 'ok' : 'error',
      attempt.status === 'SUCCEEDED'
        ? `${attempt.modelLabel} responded in ${attempt.latencyMs} ms.`
        : `${attempt.errorCategory}: ${attempt.errorMessage}`,
      {
        provider: attempt.providerKind,
        latencyMs: attempt.latencyMs,
        reason: attempt.reason,
      },
    );
  }

  if (execution.fallbackUsed && execution.response) {
    stages.add(
      'fallback',
      'Fallback succeeded',
      'warn',
      'The primary target failed and a fallback target completed the request.',
    );
  }

  const succeeded = execution.response !== null;

  stages.add(
    'normalisation',
    'Response normalised',
    succeeded ? 'ok' : 'skipped',
    succeeded
      ? 'Provider response mapped into the platform envelope.'
      : 'No response to normalise.',
  );

  const usage = execution.response?.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  const estimatedCost = execution.response?.estimatedCost ?? 0;

  stages.add(
    'usage',
    'Usage recorded',
    succeeded ? 'ok' : 'skipped',
    succeeded
      ? `${usage.totalTokens} tokens, estimated $${estimatedCost.toFixed(6)}.`
      : 'No usage recorded for a failed request.',
  );

  const totalLatencyMs = Date.now() - startedAt;
  const successfulAttempt = execution.attempts.find(
    (attempt) => attempt.status === 'SUCCEEDED',
  );

  // --- Persist the trace --------------------------------------------------
  const record = await prisma.request.create({
    data: {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      apiKeyId: input.apiKeyId,
      policyId: policy?.id ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey ?? null,
      status: succeeded ? 'SUCCEEDED' : 'FAILED',
      errorCategory: execution.finalError?.category ?? null,
      errorMessage: execution.finalError?.message ?? null,
      requestedModel: input.requestedModelId ?? null,
      resolvedModel: successfulAttempt?.modelLabel ?? null,
      fallbackUsed: execution.fallbackUsed,
      attemptCount: execution.attempts.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedCost,
      totalLatencyMs,
      routeExplanation: route.explanation as unknown as object,
      traceStages: stages.all() as unknown as object,
      source: input.source ?? 'api',
      attempts: {
        create: execution.attempts.map((attempt) => ({
          modelId: attempt.modelId,
          sequence: attempt.sequence,
          status: attempt.status,
          providerKind: attempt.providerKind,
          modelLabel: attempt.modelLabel,
          errorCategory: attempt.errorCategory,
          errorMessage: attempt.errorMessage,
          inputTokens: attempt.inputTokens,
          outputTokens: attempt.outputTokens,
          estimatedCost: attempt.estimatedCost,
          latencyMs: attempt.latencyMs,
          providerRequestId: attempt.providerRequestId,
          reason: attempt.reason,
          startedAt: attempt.startedAt,
          completedAt: attempt.completedAt,
        })),
      },
    },
  });

  await recordUsage({
    workspaceId: input.workspaceId,
    applicationId: input.applicationId,
    environmentId: input.environmentId,
    succeeded,
    fallbackUsed: execution.fallbackUsed,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCost,
    latencyMs: totalLatencyMs,
  });

  return {
    correlationId,
    requestDbId: record.id,
    status: succeeded ? 'SUCCEEDED' : 'FAILED',
    content: execution.response?.content ?? null,
    finishReason: execution.response?.finishReason ?? null,
    usage,
    estimatedCost,
    latencyMs: totalLatencyMs,
    model: successfulAttempt?.modelLabel ?? null,
    provider: successfulAttempt?.providerKind ?? null,
    fallbackUsed: execution.fallbackUsed,
    attempts: execution.attempts,
    explanation: route.explanation,
    traceStages: stages.all(),
    errorCategory: execution.finalError?.category ?? null,
    errorMessage: execution.finalError?.message ?? null,
    quotaWarning: quota.warning ? quota.detail : null,
  };
}

/** Persists a request rejected before any provider was contacted. */
async function persistRejection(args: {
  input: RunCompletionInput;
  correlationId: string;
  stages: StageRecorder;
  category: ErrorCategory;
  message: string;
  startedAt: number;
  explanation?: RouteExplanation;
}): Promise<RunCompletionResult> {
  const { input, correlationId, stages, category, message } = args;

  const explanation: RouteExplanation = args.explanation ?? {
    policyId: input.policyId,
    policyName: 'Not evaluated',
    strategy: 'BALANCED',
    candidates: [],
    rejectedCandidates: [],
    selectedCandidate: null,
    reason: message,
    scoreBreakdown: [],
    fallbackOrder: [],
    evaluatedAt: new Date().toISOString(),
  };

  const record = await prisma.request.create({
    data: {
      workspaceId: input.workspaceId,
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      apiKeyId: input.apiKeyId,
      policyId: input.policyId,
      correlationId,
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'REJECTED',
      errorCategory: category,
      errorMessage: message,
      attemptCount: 0,
      totalLatencyMs: Date.now() - args.startedAt,
      routeExplanation: explanation as unknown as object,
      traceStages: stages.all() as unknown as object,
      source: input.source ?? 'api',
    },
  });

  return {
    correlationId,
    requestDbId: record.id,
    status: 'REJECTED',
    content: null,
    finishReason: null,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    estimatedCost: 0,
    latencyMs: Date.now() - args.startedAt,
    model: null,
    provider: null,
    fallbackUsed: false,
    attempts: [],
    explanation,
    traceStages: stages.all(),
    errorCategory: category,
    errorMessage: message,
    quotaWarning: null,
  };
}

export { buildNormalisedError };
