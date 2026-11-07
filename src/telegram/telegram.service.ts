import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { DigestService } from '../digest/digest.service';
import { FeedbackService, Vote } from '../feedback/feedback.service';
import { FetchService } from '../fetch/fetch.service';
import { PROFILE_MAX_LENGTH, ProfileService } from '../profile/profile.service';

/** Button payload: "v:<itemId>:up" / "v:<itemId>:down". Telegram allows 64 bytes of callback data. */
const VOTE_PATTERN = /^v:(\d+):(up|down)$/;

/** 👍 / 👎 under an item; the current vote gets a ✓ so you can see what you picked. */
function voteKeyboard(itemId: number, current: Vote | null): InlineKeyboard {
  return new InlineKeyboard()
    .text(current === 1 ? '👍 ✓' : '👍', `v:${itemId}:up`)
    .text(current === -1 ? '👎 ✓' : '👎', `v:${itemId}:down`);
}

@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Bot;
  private readonly chatId: string | undefined;

  constructor(
    config: ConfigService,
    private readonly digest: DigestService,
    private readonly fetcher: FetchService,
    private readonly profiles: ProfileService,
    private readonly feedback: FeedbackService,
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
          `Commands: /digest — send a digest now, /fetch — pull sources now, /profile — see or change what the bot ranks for`,
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
    // "/profile" shows it; "/profile <text>" replaces it. ctx.match is the text after the command.
    this.bot.command('profile', (ctx) =>
      this.ownerOnly(ctx, async () => {
        const chatId = String(ctx.chat.id);
        const text = String(ctx.match ?? '').trim();
        if (text) {
          await this.profiles.set(chatId, text);
          const note = text.length > PROFILE_MAX_LENGTH ? ` (cut to ${PROFILE_MAX_LENGTH} characters)` : '';
          await ctx.reply(`Profile saved${note}. The next digest is ranked against it.`);
          return;
        }
        const current = await this.profiles.get(chatId);
        await ctx.reply(
          `Your profile — the digest is ranked and advised against this:\n\n${current}\n\n` +
            `To change it, send /profile followed by the new text (everything is replaced).`,
        );
      }),
    );
    // A tap on 👍 / 👎. Tapping the same button again clears the vote.
    this.bot.callbackQuery(VOTE_PATTERN, async (ctx) => {
      if (String(ctx.chat?.id) !== this.chatId) {
        await ctx.answerCallbackQuery({ text: 'This bot is private.' });
        return;
      }
      const itemId = Number(ctx.match[1]);
      const vote: Vote = ctx.match[2] === 'up' ? 1 : -1;
      const stored = await this.feedback.toggle(this.chatId, itemId, vote);
      // The small toast at the top of the chat, then redraw the buttons to show the ✓.
      await ctx.answerCallbackQuery({ text: stored === null ? 'Vote removed' : 'Noted — next week\'s ranking will use it' });
      await ctx.editMessageReplyMarkup({ reply_markup: voteKeyboard(itemId, stored) });
    });
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
    const options = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };
    await this.bot.api.sendMessage(this.chatId, digest.header, options);
    // One message per item: Telegram attaches buttons to a whole message, so this puts 👍 / 👎 right under each.
    for (const item of digest.items) {
      await this.bot.api.sendMessage(this.chatId, item.text, { ...options, reply_markup: voteKeyboard(item.id, null) });
    }
    await this.digest.markSent(digest);
    this.logger.log(`Digest sent with ${digest.items.length} items`);
  }

  private async ownerOnly(ctx: Context, action: () => Promise<void>) {
    if (String(ctx.chat?.id) !== this.chatId) {
      await ctx.reply('This bot is private. Send /start to see your chat id.');
      return;
    }
    await action();
  }
}
