import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { Item } from './item.entity';
import { FetchedItem } from '../fetch/fetched-item';

@Injectable()
export class ItemsService {
  constructor(@InjectRepository(Item) private readonly repo: Repository<Item>) {}

  /** Inserts items whose URL we haven't seen yet. Returns how many were new. */
  async saveNew(items: FetchedItem[]): Promise<number> {
    if (!items.length) return 0;
    const seen = new Set<string>();
    for (const batch of chunk(items.map((i) => i.url), BATCH_SIZE)) {
      const existing = await this.repo.find({ select: { url: true }, where: { url: In(batch) } });
      existing.forEach((e) => seen.add(e.url));
    }

    const fresh: FetchedItem[] = [];
    for (const item of items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url); // same URL twice in one batch (e.g. two feeds)
      fresh.push(item);
    }
    // SQLite rejects one giant INSERT, so write in batches. updateEntity(false) skips
    // TypeORM's follow-up SELECT of generated columns, which we don't need.
    for (const batch of chunk(fresh, BATCH_SIZE)) {
      await this.repo.createQueryBuilder().insert().values(batch).updateEntity(false).execute();
    }
    return fresh.length;
  }

  /**
   * Unsent items from the last `maxAgeHours`, best first, with at most `perSource` from
   * any one source so a single busy feed can't fill the whole digest.
   */
  async pickForDigest(limit: number, perSource = 3, maxAgeHours = 48): Promise<Item[]> {
    const since = new Date(Date.now() - maxAgeHours * 3600_000);
    const candidates = await this.repo.find({
      where: { sentAt: IsNull(), fetchedAt: MoreThan(since) },
      order: { score: 'DESC', publishedAt: 'DESC' },
      take: limit * 10,
    });

    const perSourceCount = new Map<string, number>();
    const picked: Item[] = [];
    for (const item of candidates) {
      const count = perSourceCount.get(item.source) ?? 0;
      if (count >= perSource) continue;
      perSourceCount.set(item.source, count + 1);
      picked.push(item);
      if (picked.length === limit) break;
    }
    return picked;
  }

  async markSent(ids: number[]): Promise<void> {
    if (ids.length) await this.repo.update({ id: In(ids) }, { sentAt: new Date() });
  }
}

const BATCH_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
