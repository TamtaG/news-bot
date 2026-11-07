import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One question asked about a digest item, with the bot's answer. Earlier turns give follow-ups context. */
@Entity('questions')
@Index(['chatId', 'itemId'])
export class Question {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chatId: string;

  @Column()
  itemId: number;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  /** false = the article didn't cover it. A count of these says when web search (level 2) is worth adding. */
  @Column({ type: 'boolean' })
  answeredFromArticle: boolean;

  /** Telegram id of the bot's answer message, so replying to an answer continues the same thread. */
  @Index()
  @Column({ type: 'integer' })
  answerMessageId: number;

  @CreateDateColumn()
  createdAt: Date;
}
