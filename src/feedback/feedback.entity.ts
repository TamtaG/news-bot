import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** A reader's 👍 / 👎 on one digest item. One vote per chat per item; voting again replaces it. */
@Entity('feedback')
@Index(['chatId', 'itemId'], { unique: true })
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chatId: string;

  @Column()
  itemId: number;

  /** 1 = 👍, -1 = 👎. */
  @Column({ type: 'integer' })
  vote: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
