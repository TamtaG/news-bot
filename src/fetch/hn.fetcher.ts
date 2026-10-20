import { Injectable, Logger } from '@nestjs/common';
import { FetchedItem } from './fetched-item';
import { HN_KEYWORDS, HN_MIN_POINTS } from './sources';

const API = 'https://hacker-news.firebaseio.com/v0';
const TOP_N = 60;

interface HnStory {
  id: number;
  type: string;
  title?: string;
  url?: string;
  score?: number;
  time?: number;
  dead?: boolean;
  deleted?: boolean;
}

@Injectable()
export class HnFetcher {
  private readonly logger = new Logger(HnFetcher.name);
  private readonly keywordRegex = new RegExp(
    `\\b(${HN_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i',
  );

  async fetch(): Promise<FetchedItem[]> {
    const ids = (await getJson<number[]>(`${API}/topstories.json`)).slice(0, TOP_N);
    // The HN API has no batch endpoint: one request per story. 60 parallel GETs is fine.
    const results = await Promise.allSettled(ids.map((id) => getJson<HnStory>(`${API}/item/${id}.json`)));

    const items: FetchedItem[] = [];
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const s = r.value;
      if (s.type !== 'story' || s.dead || s.deleted || !s.title) continue;
      if ((s.score ?? 0) < HN_MIN_POINTS) continue;
      if (!this.keywordRegex.test(s.title)) continue;

      const discussionUrl = `https://news.ycombinator.com/item?id=${s.id}`;
      items.push({
        source: 'hn',
        url: s.url ?? discussionUrl, // "Ask HN" posts have no external URL
        title: s.title,
        snippet: null,
        score: s.score ?? 0,
        discussionUrl,
        publishedAt: s.time ? new Date(s.time * 1000) : null,
      });
    }
    this.logger.log(`Hacker News: ${items.length} matching of ${ids.length} top stories`);
    return items;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}
