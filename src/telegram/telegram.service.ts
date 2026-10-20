import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context } from 'grammy';
import { DigestService } from '../digest/digest.service';
import { FetchService } from '../fetch/fetch.service';

const TELEGRAM_MAX_LENGTH = 4096;

@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Bot;
  private readonly chatId: string | undefined;

  constructor(
    config: ConfigService,
    private readonly digest: DigestService,
    private readonly fetcher: FetchService,
  ) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing — see README');
    this.bot = new Bot(token);
    this.chatId = config.get<string>('TELEGRAM_CHAT_ID') || undefined;
  }

  onApplicationBootstrap() {
    // /start is open to anyone so you can discover your chat id; everything else is owner-only.
    this.bot.command('start', (ctx) =>
      ctx.reply(
        `Hi! Your chat id is <code>${ctx.chat.id}</code>.\n` +
          `Put it in .env as TELEGRAM_CHAT_ID and restart.\n\n` +
          `Commands: /digest — send a digest now, /fetch — pull sources now`,
        { parse_mode: 'HTML' },
      ),
    );
    this.bot.command('digest', (ctx) => this.ownerOnly(ctx, () => this.sendDigest()));
    this.bot.command('fetch', (ctx) =>
      this.ownerOnly(ctx, async () => {
        const { fetched, saved } = await this.fetcher.fetchAll();
        await ctx.reply(`Fetched ${fetched} items, ${saved} new.`);
      }),
    );
    this.bot.catch((err) => this.logger.error(`Bot error: ${err.message}`));

    // Long polling: no public URL / webhook needed. Not awaited — it runs until stop().
    void this.bot.start({ onStart: (me) => this.logger.log(`Bot @${me.username} is polling`) });
    if (!this.chatId) this.logger.warn('TELEGRAM_CHAT_ID not set — send /start to the bot to get it');
  }

  async onApplicationShutdown() {
    await this.bot.stop();
  }

  /** Builds the digest, sends it to the owner chat and marks the items as sent. */
  async sendDigest(): Promise<void> {
    if (!this.chatId) {
      this.logger.warn('Skipping digest: TELEGRAM_CHAT_ID not set');
      return;
    }
    const digest = await this.digest.build();
    if (!digest) {
      await this.bot.api.sendMessage(this.chatId, 'Nothing new since the last digest.');
      return;
    }
    for (const chunk of splitMessage(digest.text)) {
      await this.bot.api.sendMessage(this.chatId, chunk, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
    }
    await this.digest.markSent(digest);
    this.logger.log(`Digest sent with ${digest.itemIds.length} items`);
  }

  private async ownerOnly(ctx: Context, action: () => Promise<void>) {
    if (String(ctx.chat?.id) !== this.chatId) {
      await ctx.reply('This bot is private. Send /start to see your chat id.');
      return;
    }
    await action();
  }
}

/** Telegram caps messages at 4096 chars; split on item boundaries (blank lines). */
function splitMessage(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    const next = current ? `${current}\n\n${block}` : block;
    if (next.length > TELEGRAM_MAX_LENGTH && current) {
      chunks.push(current);
      current = block;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
