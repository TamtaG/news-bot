import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** What the bot knows about a reader: free text the LLM ranks and writes advice against. */
@Entity('profiles')
export class Profile {
  @PrimaryGeneratedColumn()
  id: number;

  /** Telegram chat id. One profile per chat, so more users are possible later. */
  @Column({ unique: true })
  chatId: string;

  @Column({ type: 'text' })
  text: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
