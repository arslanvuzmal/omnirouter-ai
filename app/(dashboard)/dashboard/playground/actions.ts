'use server';

import { runCompletion, type RunCompletionResult } from '@/lib/ai/gateway';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/database/client';
import { PermissionDeniedError } from '@/lib/permissions/rbac';
import { playgroundSchema, simulationToBehaviour } from '@/lib/validation/schemas';
import type { DemoBehaviour } from '@/lib/ai/types';

/**
 * Playground execution.
 *
 * Calls the same `runCompletion` the public API calls, so what a user sees here
 * is evidence about production behaviour rather than a separate mock path.
 */

export interface PlaygroundResult {
  ok: boolean;
  error?: string;
  requestId?: string;
  correlationId?: string;
  content?: string | null;
  model?: string | null;
  provider?: string | null;
  status?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  fallbackUsed?: boolean;
  attemptCount?: number;
  routingReason?: string;
  strategy?: string;
  errorCategory?: string | null;
  errorMessage?: string | null;
  structuredValid?: boolean | null;
}

const STRUCTURED_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    sentiment: { type: 'string' },
    priority: { type: 'number' },
  },
  required: ['summary', 'sentiment', 'priority'],
} as const;

function toResult(
  result: RunCompletionResult,
  structured: boolean,
): PlaygroundResult {
  let structuredValid: boolean | null = null;

  if (structured && result.content) {
    // Report whether the response actually parsed, rather than assuming the
    // provider honoured the schema.
    try {
      const parsed: unknown = JSON.parse(result.content);
      structuredValid = typeof parsed === 'object' && parsed !== null;
    } catch {
      structuredValid = false;
    }
  }

  return {
    ok: result.status === 'SUCCEEDED',
    requestId: result.requestDbId,
    correlationId: result.correlationId,
    content: result.content,
    model: result.model,
    provider: result.provider,
    status: result.status,
    latencyMs: result.latencyMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    estimatedCost: result.estimatedCost,
    fallbackUsed: result.fallbackUsed,
    attemptCount: result.attempts.length,
    routingReason: result.explanation.reason,
    strategy: result.explanation.strategy,
    errorCategory: result.errorCategory,
    errorMessage: result.errorMessage,
    structuredValid,
  };
}

export async function runPlaygroundAction(
  input: unknown,
): Promise<PlaygroundResult> {
  const parsed = playgroundSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  let context;
  try {
    // Enforced on the server: a VIEWER cannot execute here even if the button
    // were reachable, because this check runs before anything else.
    context = await requirePermission('playground:execute');
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return {
        ok: false,
        error:
          'Your role does not permit running requests. Developer access or above is required.',
      };
    }
    throw error;
  }

  // The application and environment must belong to the caller's workspace.
  const environment = await prisma.environment.findFirst({
    where: {
      id: parsed.data.environmentId,
      application: {
        id: parsed.data.applicationId,
        workspaceId: context.workspaceId,
      },
    },
    select: { id: true, type: true, defaultPolicyId: true },
  });

  if (!environment) {
    return { ok: false, error: 'That application or environment was not found.' };
  }

  let policyId = parsed.data.policyId ?? environment.defaultPolicyId;

  if (parsed.data.policyId) {
    const policy = await prisma.routingPolicy.findFirst({
      where: { id: parsed.data.policyId, workspaceId: context.workspaceId },
      select: { id: true },
    });
    if (!policy) return { ok: false, error: 'That routing policy was not found.' };
    policyId = policy.id;
  }

  const behaviour = simulationToBehaviour(parsed.data.simulate) as
    | DemoBehaviour
    | undefined;

  const result = await runCompletion({
    workspaceId: context.workspaceId,
    applicationId: parsed.data.applicationId,
    environmentId: environment.id,
    environmentType: environment.type,
    apiKeyId: null,
    policyId,
    messages: [
      ...(parsed.data.systemPrompt
        ? [{ role: 'system' as const, content: parsed.data.systemPrompt }]
        : []),
      { role: 'user' as const, content: parsed.data.userPrompt },
    ],
    temperature: parsed.data.temperature,
    maxTokens: parsed.data.maxTokens,
    structuredOutputSchema: parsed.data.structuredOutput
      ? (STRUCTURED_SCHEMA as unknown as Record<string, unknown>)
      : undefined,
    demoBehaviour: behaviour,
    // Faulting the whole primary target is what produces a genuine fallback
    // to a different model, rather than a same-target retry succeeding.
    demoBehaviourScope: behaviour ? 'first_candidate' : undefined,
    source: 'playground',
  });

  return toResult(result, Boolean(parsed.data.structuredOutput));
}

/**
 * Comparison mode.
 *
 * Runs the same prompt through several configurations. Deliberately sequential:
 * concurrent execution would distort the latency figures the comparison exists
 * to show.
 */
export async function runComparisonAction(
  inputs: unknown[],
): Promise<PlaygroundResult[]> {
  const results: PlaygroundResult[] = [];

  for (const input of inputs) {
    results.push(await runPlaygroundAction(input));
  }

  return results;
}
