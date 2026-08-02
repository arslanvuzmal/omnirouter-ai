import { z } from 'zod';

/**
 * Request validation.
 *
 * Every external input crosses one of these schemas before reaching a query.
 * Bounds are explicit so an oversized or malformed payload is rejected cheaply
 * rather than being carried into the database or a provider call.
 */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Enter a valid email address.');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name.').max(80),
  email: emailSchema,
  password: z
    .string()
    .min(10, 'Use at least 10 characters.')
    .max(200)
    .regex(/[a-z]/, 'Include a lowercase letter.')
    .regex(/[A-Z]/, 'Include an uppercase letter.')
    .regex(/[0-9]/, 'Include a digit.'),
  workspaceName: z.string().trim().min(2, 'Name your workspace.').max(60),
});

/* -------------------------------------------------------------------------- */
/* Unified API                                                                 */
/* -------------------------------------------------------------------------- */

/** Caps chosen to bound work before a provider is contacted. */
export const MAX_MESSAGES = 64;
export const MAX_MESSAGE_CHARS = 32_000;
export const MAX_TOTAL_CHARS = 200_000;

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

export const chatCompletionSchema = z
  .object({
    model: z.string().trim().min(1).max(120).optional(),
    messages: z.array(chatMessageSchema).min(1).max(MAX_MESSAGES),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(32_000).optional(),
    stream: z.boolean().optional(),
    policy: z.string().trim().max(120).optional(),
    response_format: z
      .object({
        type: z.literal('json_schema'),
        json_schema: z.object({
          name: z.string().optional(),
          schema: z.record(z.string(), z.unknown()),
        }),
      })
      .optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (value) =>
      value.messages.reduce((sum, m) => sum + m.content.length, 0) <=
      MAX_TOTAL_CHARS,
    { message: `Total message content exceeds ${MAX_TOTAL_CHARS} characters.` },
  );

export type ChatCompletionInput = z.infer<typeof chatCompletionSchema>;

/* -------------------------------------------------------------------------- */
/* Dashboard resources                                                         */
/* -------------------------------------------------------------------------- */

export const applicationSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280).optional(),
});

export const routingPolicySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280).optional(),
  strategy: z.enum([
    'MANUAL',
    'PRIORITY',
    'WEIGHTED',
    'LOWEST_ESTIMATED_COST',
    'LOWEST_RECENT_LATENCY',
    'RELIABILITY_FIRST',
    'CAPABILITY_MATCH',
    'BALANCED',
  ]),
  maxAttempts: z.number().int().min(1).max(6),
  attemptTimeoutMs: z.number().int().min(1_000).max(120_000),
  totalTimeoutMs: z.number().int().min(1_000).max(300_000),
  maxEstimatedCost: z.number().min(0).max(100).nullable().optional(),
  rules: z
    .array(
      z.object({
        modelId: z.string().min(1),
        priority: z.number().int().min(1).max(99),
        weight: z.number().int().min(0).max(100),
        enabled: z.boolean(),
      }),
    )
    .min(1, 'Attach at least one model.')
    .max(20),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  applicationId: z.string().min(1),
  environmentId: z.string().min(1),
  scopes: z.array(z.string().max(60)).max(10).default([]),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const quotaSchema = z.object({
  name: z.string().trim().min(2).max(60),
  window: z.enum(['MINUTE', 'DAY', 'MONTH']),
  applicationId: z.string().min(1).nullable().optional(),
  maxRequests: z.number().int().min(1).nullable().optional(),
  maxTokens: z.number().int().min(1).nullable().optional(),
  maxCost: z.number().min(0).nullable().optional(),
  warnThreshold: z.number().min(0.1).max(1),
  action: z.enum(['WARN', 'REJECT', 'ROUTE_LOWER_COST']),
});

export const promptVersionSchema = z.object({
  systemPrompt: z.string().trim().max(8_000),
  userTemplate: z.string().trim().min(1).max(8_000),
  changeNote: z.string().trim().max(280).optional(),
});

export const playgroundSchema = z.object({
  applicationId: z.string().min(1),
  environmentId: z.string().min(1),
  policyId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
  systemPrompt: z.string().max(MAX_MESSAGE_CHARS).optional(),
  userPrompt: z.string().min(1).max(MAX_MESSAGE_CHARS),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8_000).optional(),
  structuredOutput: z.boolean().optional(),
  simulate: z
    .enum([
      'none',
      'timeout',
      'rate_limit',
      'unavailable',
      'malformed',
      'auth_failure',
      'safety_refusal',
    ])
    .optional(),
});

export type PlaygroundInput = z.infer<typeof playgroundSchema>;

/** Maps a simulation choice onto demo-provider fault directives. */
export function simulationToBehaviour(
  simulate: PlaygroundInput['simulate'],
): Record<string, boolean> | undefined {
  switch (simulate) {
    case 'timeout':
      return { forceTimeout: true };
    case 'rate_limit':
      return { forceRateLimit: true };
    case 'unavailable':
      return { forceUnavailable: true };
    case 'malformed':
      return { forceMalformed: true };
    case 'auth_failure':
      return { forceAuthFailure: true };
    case 'safety_refusal':
      return { forceSafetyRefusal: true };
    default:
      return undefined;
  }
}
