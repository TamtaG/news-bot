import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Item } from '../items/item.entity';
import { ItemsService } from '../items/items.service';
import { RSS_SOURCES } from '../fetch/sources';
import { FeedbackService } from '../feedback/feedback.service';
import { describeLlmError, LlmService } from '../llm/llm.service';
import { ProfileService } from '../profile/profile.service';
import { Ranking, RankerService } from '../rank/ranker.service';
import { AdviceService } from '../summarize/advice.service';

/** Telegram HTML-formatted. Sent as one header message, then one message per item (so each gets 👍 / 👎). */
export interface Digest {
  header: string;
  items: { id: number; text: string }[];
}

const SOURCE_NAMES: Record<string, string> = {
  hn: 'Hacker News',
  ...Object.fromEntries(RSS_SOURCES.map((s) => [s.key, s.name])),
};
const sourceName = (key: string) => SOURCE_NAMES[key] ?? key;

/**
 * Builds the digest. Doesn't send anything — Telegram does that.
 *
 *   candidates (≈40, cheap score order) → LLM ranks all of them against the profile + past 👍/👎
 *   → keep the best few (min score, no duplicates, max N per source) → LLM writes what / why / try
 *
 * Without an API key (or if ranking fails) it falls back to the cheap score order, no advice.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly items: ItemsService,
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly ranker: RankerService,
    private readonly advice: AdviceService,
    private readonly profiles: ProfileService,
    private readonly feedback: FeedbackService,
  ) {}

  async build(): Promise<Digest | null> {
    const size = this.num('DIGEST_SIZE', 7);
    const perSource = this.num('DIGEST_MAX_PER_SOURCE', 3);
    const lookbackHours = this.num('DIGEST_LOOKBACK_HOURS', 168);

    if (!this.llm.enabled) {
      this.logger.warn('ANTHROPIC_API_KEY not set — picking by score, without ranking or advice');
      const picked = await this.items.pickForDigest(size, perSource, lookbackHours);
      return picked.length ? this.format(picked) : null;
    }

    // Wider net than the digest size, so the LLM has real choices. Per-source cap keeps HN from filling it.
    const candidates = await this.items.pickForDigest(this.num('DIGEST_CANDIDATES', 40), 8, lookbackHours);
    if (!candidates.length) return null;
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID');
    const profile = await this.profiles.get(chatId);
    const votes = await this.feedback.recent(chatId);

    let picked: Item[];
    try {
      const { rankings } = await this.ranker.rank(candidates, profile, votes, sourceName);
      picked = select(candidates, rankings, { size, perSource, minScore: this.num('DIGEST_MIN_SCORE', 6) });
      this.logger.log(`Picked ${picked.length} of ${candidates.length} candidates`);
    } catch (err) {
      this.logger.error(`Ranking failed, falling back to score order: ${describeLlmError(err)}`);
      picked = await this.items.pickForDigest(size, perSource, lookbackHours);
    }

    if (!picked.length) {
      return { header: `Nothing cleared the bar this week (${candidates.length} items checked).`, items: [] };
    }
    await this.advice.writeMissing(picked, profile);
    return this.format(picked);
  }

  markSent(digest: Digest): Promise<void> {
    return this.items.markSent(digest.items.map((i) => i.id));
  }

  private format(picked: Item[]): Digest {
    const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return {
      header: `<b>📰 Weekly tech digest — ${date}</b>\n${picked.length} picks. Tap 👍 / 👎 under each one to tune next week's ranking.`,
      items: picked.map((item, i) => ({ id: item.id, text: formatItem(item, i) })),
    };
  }

  private num(key: string, fallback: number): number {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

/** Best LLM score first; drops low scores and duplicates; caps items per source. */
function select(candidates: Item[], rankings: Map<number, Ranking>, opts: { size: number; perSource: number; minScore: number }): Item[] {
  const ranked = candidates
    .filter((c) => {
      const r = rankings.get(c.id);
      return r && r.duplicateOf === null && r.score >= opts.minScore;
    })
    // Stable sort: equal LLM scores keep the cheap score order they arrived in.
    .sort((a, b) => rankings.get(b.id)!.score - rankings.get(a.id)!.score);

  const perSourceCount = new Map<string, number>();
  const picked: Item[] = [];
  for (const item of ranked) {
    const count = perSourceCount.get(item.source) ?? 0;
    if (count >= opts.perSource) continue;
    perSourceCount.set(item.source, count + 1);
    picked.push(item);
    if (picked.length === opts.size) break;
  }
  return picked;
}

function formatItem(item: Item, index: number): string {
  const source = sourceName(item.source);
  const meta = item.discussionUrl
    ? `${source} · ${item.score} pts · <a href="${escape(item.discussionUrl)}">comments</a>`
    : source;
  const lines = [`<b>${index + 1}. <a href="${escape(item.url)}">${escape(item.title)}</a></b>`];
  if (item.summary) lines.push(escape(item.summary));
  if (item.why) lines.push(`💡 ${escape(item.why)}`);
  if (item.tryIt) lines.push(`🛠 <b>Try:</b> ${escape(item.tryIt)}`);
  lines.push(`<i>${meta}</i>`);
  return lines.join('\n');
}

/** Telegram HTML mode only needs these escaped. */
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
