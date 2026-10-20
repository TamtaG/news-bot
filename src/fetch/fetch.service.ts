import { Injectable, Logger } from '@nestjs/common';
import { ItemsService } from '../items/items.service';
import { FetchedItem } from './fetched-item';
import { HnFetcher } from './hn.fetcher';
import { RssFetcher } from './rss.fetcher';
import { RSS_SOURCES } from './sources';

@Injectable()
export class FetchService {
  private readonly logger = new Logger(FetchService.name);

  constructor(
    private readonly rss: RssFetcher,
    private readonly hn: HnFetcher,
    private readonly items: ItemsService,
  ) {}

  /** Pulls every source in parallel; one broken feed never stops the others. */
  async fetchAll(): Promise<{ fetched: number; saved: number }> {
    const jobs: { name: string; run: Promise<FetchedItem[]> }[] = [
      ...RSS_SOURCES.map((s) => ({ name: s.name, run: this.rss.fetch(s) })),
      { name: 'Hacker News', run: this.hn.fetch() },
    ];
    const results = await Promise.allSettled(jobs.map((j) => j.run));

    const all: FetchedItem[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value);
      else this.logger.warn(`${jobs[i].name} failed: ${r.reason?.message ?? r.reason}`);
    });

    const saved = await this.items.saveNew(all);
    this.logger.log(`Fetched ${all.length} items, ${saved} new`);
    return { fetched: all.length, saved };
  }
}
