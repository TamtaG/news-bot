import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Item } from '../items/item.entity';
import { Feedback } from './feedback.entity';

export type Vote = 1 | -1;

export interface PastVote {
  vote: Vote;
  title: string;
  source: string;
}

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback) private readonly repo: Repository<Feedback>,
    @InjectRepository(Item) private readonly itemsRepo: Repository<Item>,
  ) {}

  /** Records a vote, or clears it when the same button is tapped again. Returns the vote now stored. */
  async toggle(chatId: string, itemId: number, vote: Vote): Promise<Vote | null> {
    const existing = await this.repo.findOneBy({ chatId, itemId });
    if (existing?.vote === vote) {
      await this.repo.delete({ id: existing.id });
      return null;
    }
    await this.repo.upsert({ chatId, itemId, vote }, ['chatId', 'itemId']);
    return vote;
  }

  /** The reader's most recent votes with the item titles, newest first. Input for the ranker. */
  async recent(chatId: string | undefined, limit = 30): Promise<PastVote[]> {
    if (!chatId) return [];
    const votes = await this.repo.find({ where: { chatId }, order: { updatedAt: 'DESC' }, take: limit });
    if (!votes.length) return [];

    // No TypeORM relations: join in code.
    const items = await this.itemsRepo.findBy({ id: In(votes.map((v) => v.itemId)) });
    const byId = new Map(items.map((i) => [i.id, i]));
    return votes.flatMap((v) => {
      const item = byId.get(v.itemId);
      return item ? [{ vote: v.vote as Vote, title: item.title, source: item.source }] : [];
    });
  }
}
