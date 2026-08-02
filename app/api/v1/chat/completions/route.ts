import { NextResponse } from 'next/server';

import { runCompletion } from '@/lib/ai/gateway';
import { httpStatusFor, safeMessageFor } from '@/lib/ai/errors';
import { authenticateApiKey, extractKey } from '@/lib/api-keys/authenticate';
import { prisma } from '@/lib/database/client';
import { chatCompletionSchema } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible in shape so existing clients can point at it with only a
 * base-URL change, while the internal types remain this project's own.
 *
 * Lifecycle: parse, authenticate the virtual key, resolve workspace,
 * application and environment from the key rather than the body, check scope
 * and expiry, evaluate quotas, select a route, execute with classified
 * fallback, normalise, record usage, and return a correlation id.
 */

/** Bounds the body before parsing, so an oversized payload costs almost nothing. */
const MAX_BODY_BYTES = 1_000_000;

interface ErrorBody {
  error: {
    message: string;
    type: string;
    code: string;
  };
  correlation_id?: string;
}

function errorResponse(
  status: number,
  message: string,
  code: string,
  correlationId?: string,
): NextResponse<ErrorBody> {
  const body: ErrorBody = {
    error: { message, type: 'omnirouter_error', code },
    ...(correlationId ? { correlation_id: correlationId } : {}),
  };

  return NextResponse.json(body, {
    status,
    headers: correlationId ? { 'x-omnirouter-correlation-id': correlationId } : {},
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  // --- 1. Size guard -------------------------------------------------------
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, 'Request body is too large.', 'payload_too_large');
  }

  // --- 2. Parse ------------------------------------------------------------
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, 'Request body is not valid JSON.', 'invalid_json');
  }

  const parsed = chatCompletionSchema.safeParse(raw);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return errorResponse(
      400,
      first ? `${first.path.join('.')}: ${first.message}` : 'Invalid request body.',
      'invalid_request',
    );
  }

  // --- 3. Authenticate -----------------------------------------------------
  const auth = await authenticateApiKey(extractKey(request.headers), {
    requiredScope: 'chat.completions',
  });

  if (!auth.ok) {
    return errorResponse(401, auth.message, 'invalid_api_key');
  }

  const { key } = auth;

  // --- 4. Resolve the routing policy --------------------------------------
  // A policy named in the body is honoured only if it belongs to the key's
  // workspace; otherwise the environment default applies.
  let policyId = key.defaultPolicyId;

  if (parsed.data.policy) {
    const named = await prisma.routingPolicy.findFirst({
      where: {
        workspaceId: key.workspaceId,
        name: parsed.data.policy,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!named) {
      return errorResponse(
        400,
        `No active routing policy named "${parsed.data.policy}" exists in this workspace.`,
        'unknown_policy',
      );
    }

    policyId = named.id;
  }

  // --- 5. Idempotency ------------------------------------------------------
  const idempotencyKey = request.headers.get('idempotency-key');

  if (idempotencyKey) {
    const existing = await prisma.request.findFirst({
      where: { workspaceId: key.workspaceId, idempotencyKey },
      select: { correlationId: true, status: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          error: {
            message:
              'A request with this Idempotency-Key has already been processed.',
            type: 'omnirouter_error',
            code: 'idempotency_replay',
          },
          correlation_id: existing.correlationId,
        },
        {
          status: 409,
          headers: { 'x-omnirouter-correlation-id': existing.correlationId },
        },
      );
    }
  }

  // --- 6. Execute ----------------------------------------------------------
  const result = await runCompletion({
    workspaceId: key.workspaceId,
    applicationId: key.applicationId,
    environmentId: key.environmentId,
    environmentType: key.environmentType,
    apiKeyId: key.apiKeyId,
    policyId,
    messages: parsed.data.messages,
    temperature: parsed.data.temperature,
    maxTokens: parsed.data.max_tokens,
    requestedModelId: parsed.data.model,
    structuredOutputSchema: parsed.data.response_format?.json_schema.schema as
      | Record<string, unknown>
      | undefined,
    idempotencyKey,
    source: 'api',
  });

  const headers: Record<string, string> = {
    'x-omnirouter-correlation-id': result.correlationId,
    'x-omnirouter-fallback-used': String(result.fallbackUsed),
    'x-omnirouter-attempts': String(result.attempts.length),
  };

  if (result.quotaWarning) {
    headers['x-omnirouter-quota-warning'] = result.quotaWarning;
  }

  // --- 7. Failure ----------------------------------------------------------
  if (result.status !== 'SUCCEEDED' || result.content === null) {
    const category = result.errorCategory ?? 'UNKNOWN';

    return NextResponse.json(
      {
        error: {
          // The stored message is already sanitised — provider text is never
          // forwarded, so this cannot leak prompts or internal endpoints.
          message: result.errorMessage ?? safeMessageFor(category),
          type: 'omnirouter_error',
          code: category.toLowerCase(),
        },
        correlation_id: result.correlationId,
      },
      { status: httpStatusFor(category), headers },
    );
  }

  // --- 8. Success ----------------------------------------------------------
  return NextResponse.json(
    {
      id: result.correlationId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: result.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: result.content },
          finish_reason: result.finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.totalTokens,
      },
      // Namespaced so the payload stays compatible with OpenAI-shaped clients
      // that ignore unknown fields.
      omnirouter: {
        correlation_id: result.correlationId,
        provider: result.provider,
        fallback_used: result.fallbackUsed,
        attempts: result.attempts.length,
        estimated_cost: result.estimatedCost,
        latency_ms: result.latencyMs,
        policy: result.explanation.policyName,
        strategy: result.explanation.strategy,
        routing_reason: result.explanation.reason,
      },
    },
    { status: 200, headers },
  );
}

export async function GET(): Promise<NextResponse> {
  return errorResponse(
    405,
    'Use POST for chat completions.',
    'method_not_allowed',
  );
}
