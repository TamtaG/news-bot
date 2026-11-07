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

  /** LLM summary: what it is. null = not written yet, '' = tried but nothing usable to summarize. */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** The article as plain text, saved when advice is written so follow-up questions don't refetch it. */
  @Column({ type: 'text', nullable: true })
  articleText: string | null;

  /** LLM advice (v2): why it matters to the reader. null = not written yet, '' = skipped. */
  @Column({ type: 'text', nullable: true })
  why: string | null;

  /** LLM advice (v2): one concrete way to try it. */
  @Column({ type: 'text', nullable: true })
  tryIt: string | null;

  /** LLM relevance score 0–10 against the profile (v2), from the last ranking it was part of. */
  @Column({ type: 'integer', nullable: true })
  llmScore: number | null;

  /** The ranker's one-line reason, kept for debugging "why did this get picked?". */
  @Column({ type: 'text', nullable: true })
  rankReason: string | null;

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
