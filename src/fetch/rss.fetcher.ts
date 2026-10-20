import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { FetchedItem } from './fetched-item';
import { RssSource } from './sources';

const SNIPPET_MAX = 500;
/** Some feeds ship their whole archive (OpenAI: 1000+ entries). Only keep recent ones. */
const MAX_AGE_DAYS = 7;
/** Entries without a date can't be age-checked; keep only the top few of those. */
const MAX_UNDATED = 10;

@Injectable()
export class RssFetcher {
  private readonly logger = new Logger(RssFetcher.name);
  private readonly parser = new Parser({ timeout: 15_000 });

  async fetch(source: RssSource): Promise<FetchedItem[]> {
    const feed = await this.parser.parseURL(source.url);

    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const items: FetchedItem[] = [];
    let undated = 0;
    for (const entry of feed.items) {
      // Feeds are messy: trust nothing, skip entries without a link or title.
      const url = entry.link?.trim();
      const title = entry.title?.trim();
      if (!url || !title) continue;

      const raw = entry.isoDate ?? entry.pubDate;
      const parsed = raw ? new Date(raw) : null;
      const publishedAt = parsed && !isNaN(parsed.getTime()) ? parsed : null;
      if (publishedAt ? publishedAt.getTime() < cutoff : ++undated > MAX_UNDATED) continue;

      items.push({
        source: source.key,
        url,
        title,
        snippet: clean(entry.contentSnippet ?? entry.summary ?? null),
        score: source.weight,
        discussionUrl: null,
        publishedAt,
      });
    }
    this.logger.log(`${source.name}: ${items.length} entries`);
    return items;
  }
}

function clean(text: string | null): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > SNIPPET_MAX ? flat.slice(0, SNIPPET_MAX) + '…' : flat || null;
}
