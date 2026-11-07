import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { costUsd, SUPPORTS_FALLBACK } from './pricing';

const DEFAULT_MODEL = 'claude-opus-5-5';

export type Effort = 'low' | 'medium' | 'high';

export interface LlmResult<T> {
  /** The parsed, schema-valid answer. null when the model refused or the output didn't parse. */
  data: T | null;
  refused: boolean;
  usage: Usage;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** null when the model isn't in the price table. */
  costUsd: number | null;
}

/**
 * The one place that talks to Claude. Every call is "structured output": we pass a zod schema,
 * the API guarantees JSON matching it, and the SDK hands back a typed object (no JSON.parse,
 * no "please answer in JSON" in the prompt).
 */
@Injectable()
export class LlmService {
  private readonly client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  readonly model: string;
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.model = config.get<string>('LLM_MODEL') || DEFAULT_MODEL;
    this.enabled = !!(config.get('ANTHROPIC_API_KEY') || config.get('ANTHROPIC_AUTH_TOKEN'));
  }

  async parse<S extends z.ZodType>(opts: { schema: S; system: string; user: string; effort: Effort }): Promise<LlmResult<z.infer<S>>> {
    const useFallback = SUPPORTS_FALLBACK.has(this.model);
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16_000,
      // Effort = how hard the model thinks before answering. Higher = better judgment, more tokens.
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      ...(useFallback && { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    });

    const usage: Usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: costUsd(response.model, response.usage.input_tokens, response.usage.output_tokens),
    };
    // A refusal can come back without schema-valid output, so check it before trusting the data.
    if (response.stop_reason === 'refusal') return { data: null, refused: true, usage };
    return { data: response.parsed_output ?? null, refused: false, usage };
  }
}

/** Adds up usage across calls so each digest step can log one line. */
export function addUsage(total: Usage, more: Usage): Usage {
  return {
    inputTokens: total.inputTokens + more.inputTokens,
    outputTokens: total.outputTokens + more.outputTokens,
    costUsd: total.costUsd === null || more.costUsd === null ? null : total.costUsd + more.costUsd,
  };
}

export const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

export function formatUsage(u: Usage): string {
  return `${u.inputTokens} in / ${u.outputTokens} out tokens` + (u.costUsd !== null ? ` · $${u.costUsd.toFixed(4)}` : '');
}

export function describeLlmError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'API key invalid or expired — check ANTHROPIC_API_KEY';
  if (err instanceof Anthropic.APIError) return `API ${err.status}: ${err.message}`;
  return (err as Error)?.message ?? String(err);
}
