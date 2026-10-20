/**
 * USD per 1M tokens (input, output), Anthropic first-party API, as of 2026-10.
 * Only used to log what each digest cost. Check https://www.anthropic.com/pricing for changes.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/**
 * Models that support server-side refusal fallback (`fallbacks: "default"`): if the
 * model's safety classifier declines, the API retries on another model in the same call.
 * Haiku has no server-side fallback, so we don't send the parameter there.
 */
export const SUPPORTS_FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);
