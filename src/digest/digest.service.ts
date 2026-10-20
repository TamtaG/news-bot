import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Item } from '../items/item.entity';
import { ItemsService } from '../items/items.service';
import { RSS_SOURCES } from '../fetch/sources';

export interface Digest {
  /** Telegram HTML-formatted text. */
  text: string;
  itemIds: number[];
}

const SOURCE_NAMES: Record<string, string> = {
  hn: 'Hacker News',
  ...Object.fromEntries(RSS_SOURCES.map((s) => [s.key, s.name])),
};

/** Picks items and formats them. Doesn't send anything — Telegram does that. */
@Injectable()
export class DigestService {
  constructor(
    private readonly items: ItemsService,
    private readonly config: ConfigService,
  ) {}

  async build(): Promise<Digest | null> {
    const size = Number(this.config.get('DIGEST_SIZE') ?? 10);
    const perSource = Number(this.config.get('DIGEST_MAX_PER_SOURCE') ?? 3);
    const picked = await this.items.pickForDigest(size, perSource);
    if (!picked.length) return null;

    const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    const lines = [`<b>📰 Tech digest — ${date}</b>`, '', ...picked.map(formatItem)];
    return { text: lines.join('\n'), itemIds: picked.map((i) => i.id) };
  }

  markSent(digest: Digest): Promise<void> {
    return this.items.markSent(digest.itemIds);
  }
}

function formatItem(item: Item, index: number): string {
  const source = SOURCE_NAMES[item.source] ?? item.source;
  const meta = item.discussionUrl
    ? `${source} · ${item.score} pts · <a href="${escape(item.discussionUrl)}">comments</a>`
    : source;
  // v1: the LLM summary goes on a line under the title.
  return `${index + 1}. <a href="${escape(item.url)}">${escape(item.title)}</a>\n<i>${meta}</i>\n`;
}

/** Telegram HTML mode only needs these three escaped. */
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
