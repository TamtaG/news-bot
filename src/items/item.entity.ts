import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One article / post / HN story we've seen. Deduplicated by URL. */
@Entity('items')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  /** Source key from sources.ts, e.g. "hn" or "simonwillison". */
  @Column()
  source: string;

  @Index({ unique: true })
  @Column()
  url: string;

  @Column()
  title: string;

  /** Short text from the feed (description / first paragraph). Input for the LLM summary in v1. */
  @Column({ type: 'text', nullable: true })
  snippet: string | null;

  /** Ranking score. v0: HN points, or the source's fixed weight for RSS. v2: LLM relevance score. */
  @Column({ type: 'integer', default: 0 })
  score: number;

  /** Link to the HN comment thread, when the item came from HN. */
  @Column({ type: 'varchar', nullable: true })
  discussionUrl: string | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;

  /** Set once the item went out in a digest, so it is never sent twice. */
  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn()
  fetchedAt: Date;
}
