import type { TokenUsage } from './types';

/**
 * Cost estimation.
 *
 * Every figure the platform displays is an estimate derived from pricing the
 * workspace configured on each model, applied to token counts that are
 * themselves partly estimated. It is a planning signal, never a bill, and the
 * interface labels it accordingly.
 */

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPricePerMillion: number;
  /** USD per million output tokens. */
  outputPricePerMillion: number;
}

const MILLION = 1_000_000;

export function estimateCost(usage: TokenUsage, pricing: ModelPricing): number {
  const input = (usage.inputTokens / MILLION) * pricing.inputPricePerMillion;
  const output = (usage.outputTokens / MILLION) * pricing.outputPricePerMillion;

  // Six decimal places matches the Decimal(12,6) column and keeps sub-cent
  // per-request costs from rounding away to zero.
  return roundCurrency(input + output);
}

/** Projected cost before a call, used by cost-aware routing and quota checks. */
export function projectCost(
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
  pricing: ModelPricing,
): number {
  return estimateCost(
    {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      totalTokens: estimatedInputTokens + estimatedOutputTokens,
    },
    pricing,
  );
}

export function roundCurrency(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Compact display form; very small amounts keep their significant digits. */
export function formatCost(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}
