import type { ChatMessage } from './types';

/**
 * Token estimation.
 *
 * This is a heuristic, not a tokeniser. Shipping a real BPE tokeniser per
 * provider would add tens of megabytes and still be wrong for any model whose
 * vocabulary is undocumented. The platform therefore treats token counts as
 * estimates everywhere and labels them as such in the interface.
 *
 * When a provider returns authoritative usage, that value always replaces the
 * estimate — see normaliseUsage below.
 */

/** Roughly four characters per token for English prose, with a floor of one. */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const characters = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  // Blend a character-based and a word-based estimate; the two disagree most on
  // code and on heavily punctuated text, and averaging reduces the worst case.
  const byCharacters = characters / 4;
  const byWords = words * 1.3;

  return Math.max(1, Math.round((byCharacters + byWords) / 2));
}

/** Message overhead approximates the role and delimiter tokens providers add. */
const PER_MESSAGE_OVERHEAD = 4;

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) =>
      total + estimateTokens(message.content) + PER_MESSAGE_OVERHEAD,
    0,
  );
}

export interface UsageInput {
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/**
 * Prefers provider-reported usage and falls back to estimates. Guarantees a
 * consistent, non-negative TokenUsage shape regardless of what the provider sent.
 */
export function normaliseUsage(
  reported: UsageInput | null | undefined,
  fallback: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const inputTokens = Math.max(
    0,
    Math.round(reported?.inputTokens ?? fallback.inputTokens),
  );
  const outputTokens = Math.max(
    0,
    Math.round(reported?.outputTokens ?? fallback.outputTokens),
  );

  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** True when the prompt cannot fit, leaving room for the requested output. */
export function exceedsContextWindow(
  promptTokens: number,
  maxOutputTokens: number,
  contextWindow: number,
): boolean {
  return promptTokens + maxOutputTokens > contextWindow;
}
