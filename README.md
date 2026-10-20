# news-bot

A personal Telegram bot that sends me a daily digest of AI and software-engineering news.

Built as a learning project, one step at a time:

| Version | What it adds | What I learn |
|---|---|---|
| **v0** ✅ | Fetch RSS + Hacker News → SQLite → daily Telegram digest (titles + links) | Pipeline plumbing, cron, Telegram bots |
| v1 | 2-line LLM summary per item | Prompts, API calls, tokens & cost |
| v2 | LLM scores each item 1–10 against my interests (structured JSON) | Structured output, LLM-as-judge |
| v3 | 👍/👎 buttons, feedback fed back into scoring | Feedback loops |
| v4 | Group "same story from 10 sources" with embeddings | Embeddings, vector similarity |
| v5 | "What happened with X this week?" over the archive | RAG |

## How it works (v0)

```
every hour        Fetch:  9 RSS feeds + HN top stories ─► SQLite (dedup by URL)
DIGEST_CRON       Pick:   unsent, last 48h, highest score, max 3 per source
                  Send:   Telegram message, mark items as sent
```

- **Score** in v0 is simple: HN points for HN stories, a fixed per-feed `weight` for RSS (see `src/fetch/sources.ts`).
- HN is filtered by title keywords, since most of the front page is off-topic. v2 replaces this with LLM scoring.
- RSS entries older than 7 days are ignored (some feeds ship their whole archive).

```
src/
  fetch/      sources.ts (feeds, weights, HN keywords), rss + hn fetchers, FetchService
  items/      Item entity + ItemsService (save new, pick for digest, mark sent)
  digest/     DigestService: pick + format (no sending)
  telegram/   grammY bot: /start, /digest, /fetch, sendDigest()
  scheduler/  hourly fetch + digest cron
  cli.ts      run fetch / preview without Telegram
```

## Setup

1. **Create the bot:** in Telegram, message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. **Configure:**
   ```bash
   cp .env.example .env
   ```
   Put the token in `TELEGRAM_BOT_TOKEN`.
3. **Find your chat id:** `npm run start:dev`, open your bot in Telegram, send `/start`. It replies with your chat id. Put it in `TELEGRAM_CHAT_ID` and restart.
4. Send `/digest` to get one right away.

## Commands

```bash
npm run start:dev        # run the bot (hot reload)
npm run fetch:once       # pull all sources into the DB, no Telegram needed
npm run digest:preview   # print what the next digest would contain
```

In Telegram: `/digest` sends a digest now, `/fetch` pulls sources now. Both work only from `TELEGRAM_CHAT_ID`.

To start over: delete `data/news.sqlite`. Tables are recreated automatically (`synchronize: true`).

## Notes

- Long polling, so there's no public URL or webhook. It runs anywhere, including a laptop.
- Pinned to Nest 11 / TypeORM 0.3 / TypeScript 5.7. TypeORM 1.x needs Node ≥ 20.19.
