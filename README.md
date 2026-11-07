# news-bot

A personal Telegram bot that sends me a weekly digest of new AI and software-engineering tools and releases: what each one is, why it matters to me, and one concrete way to try it.

Built as a learning project, one step at a time:

| Version | What it adds | What I learn |
|---|---|---|
| **v0** ✅ | Fetch RSS + Hacker News → SQLite → Telegram digest (titles + links) | Pipeline plumbing, cron, Telegram bots |
| **v1** ✅ | 2-line LLM summary per item | Prompts, API calls, tokens & cost |
| **v2** ✅ | Profile; LLM ranks every candidate against it; what / why / try advice per item | Structured output, LLM-as-judge, two-stage pipelines |
| **v3** ✅ | 👍/👎 under each item; recent votes steer the next ranking | Feedback loops, in-context personalization |
| **v4** ✅ | Reply to an item with a question → answer from the article, with follow-ups | Grounded Q&A over a document, conversation history |
| v5 | Web search for questions the article can't answer | Tool-using agents (server-side tools) |
| v6 | Group "same story from 10 sources" with embeddings | Embeddings, vector similarity |
| v7 | "What happened with X this week?" over the archive | RAG |

## How it works

```
every hour     Fetch:   9 RSS feeds + HN top stories ─► SQLite (dedup by URL)

DIGEST_CRON    Gather:  ~40 unsent candidates from the last 7 days (cheap score order, max 8 per source)
(Mon 09:00)    Rank:    ONE Claude call scores all of them 0–10 against my profile + recent 👍/👎, flags duplicates
               Pick:    score ≥ 6, no duplicates, max 3 per source, top 7
               Advise:  per picked item, read the article → Claude writes what / why / try
               Send:    a header message, then one message per item with 👍 / 👎 buttons; mark items as sent
```

### The profile

Free text describing me: stack, interests, goals, and what I'm *not* interested in. It's stored per Telegram chat. See it with `/profile` and replace it with `/profile <new text>`. Until it's set, a default in `src/profile/profile.service.ts` is used. The "not interested" line matters most: it's what pushes funding news and off-topic research down.

### Feedback (`src/feedback/`)

- Each digest item is its own Telegram message, because buttons attach to a whole message. Tapping 👍 / 👎 stores a vote (one per item; tapping the same button again clears it), and a ✓ marks your current choice.
- No model training: the last 30 votes go into the ranking prompt as examples of taste ("👍 [Hacker News] Claude Code sends your email…"). The prompt tells the model to treat them as refining the profile, not replacing it.
- What to expect: votes nudge similar items by 1–2 points, and the ranker's reasons say so ("similar to downvoted item"). LLM scores also move ±1 between identical runs, which is why the cutoff is a threshold.

### Questions (`src/qa/`)

- Reply to any digest item in Telegram with a question. The bot finds the item from the link in the message you replied to, so it also works for digests sent before this feature.
- One Claude call gets the article text (fetched once, then saved on the item), your profile, the last 5 questions on that item, and the question.
- It answers from the article. When the article doesn't cover something, it says so first and won't invent specifics about the product (it's often newer than the model's knowledge). Each answer is logged as `from article` or `NOT in article`. Lots of the latter is the signal to add web search (v5).
- Reply to one of the bot's answers to ask a follow-up in the same thread.
- About $0.025 per question on `claude-opus-5-5`. `QA_MODEL=claude-haiku-5-5` makes questions ~40x cheaper while the digest stays on Opus.

To see questions that the article couldn't answer:

```bash
sqlite3 data/news.sqlite "select i.title, q.question from questions q join items i on i.id = q.itemId where q.answeredFromArticle = 0"
```

### Ranking (`src/rank/ranker.service.ts`)

- One call over titles + short snippets, so it's cheap (~5k input tokens), and seeing everything at once is what lets it spot the same story from two sources.
- The scale is spelled out in the prompt (9–10 = usable this week … 0–3 = off-topic). Newsletter roundups are capped at 3, since each digest item is one story.
- Each item's score and a one-line reason are saved (`llmScore`, `rankReason`), to answer "why did this get picked?".
- Runs at `effort: medium`: judging relevance is the core of the digest.

### Advice (`src/summarize/advice.service.ts`)

- Only for the ~7 picked items. Input is the feed snippet if it's long enough, otherwise the article page as rough plain text.
- **No text, no advice.** If the page can't be read (paywall, PDF, 403), the item goes out with just its title. A model given only a title would invent the rest.
- Runs at `effort: low`: three short sentences don't need deep thinking.

### Structured output (`src/llm/llm.service.ts`)

Both calls pass a zod schema. The API guarantees JSON matching it, and the SDK returns a typed object: no "answer in JSON" in the prompt, no `JSON.parse`. String length can't be enforced by the schema, so the prompt asks for short sentences and the code trims overruns.

### Cost

A weekly run is about **$0.15** on `claude-opus-5-5`: ~$0.05 ranking + ~$0.10 advice. Every step logs its tokens and cost. `LLM_MODEL=claude-haiku-5-5` is ~40x cheaper and worth comparing. Server-side refusal fallback (`fallbacks: "default"`) is on for models that support it.

Without `ANTHROPIC_API_KEY` the digest still goes out: picked by the cheap score, titles and links only.

```
src/
  fetch/      sources.ts (feeds, weights, HN keywords), rss + hn fetchers, FetchService
  items/      Item entity + ItemsService (save new, candidates, rankings, advice, mark sent)
  profile/    Profile entity + ProfileService (per chat, with a default)
  feedback/   Feedback entity + FeedbackService (toggle a vote, recent votes with titles)
  qa/         Question entity + QaService (find the item, answer from the article, keep the thread)
  llm/        LlmService (the one place that calls Claude: structured output, fallback, cost) + pricing
  rank/       RankerService: one call scores all candidates
  summarize/  ArticleFetcher (page → text), AdviceService (what / why / try)
  digest/     DigestService: gather → rank → pick → advise → format (no sending)
  telegram/   grammY bot: /start, /digest, /fetch, /profile, 👍/👎 buttons, replies as questions, sendDigest()
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
4. **For ranking and advice:** create an API key at [console.anthropic.com](https://console.anthropic.com) and put it in `ANTHROPIC_API_KEY`.
5. **Tell it about yourself:** send `/profile` to see the default, then `/profile <your own text>`.
6. Send `/digest` to get one right away.

## Commands

```bash
npm run start:dev        # run the bot (hot reload)
npm run fetch:once       # pull all sources into the DB, no Telegram needed
npm run digest:preview   # print what the next digest would contain (runs the LLM calls)
```

In Telegram: `/digest` sends a digest now, `/fetch` pulls sources now, `/profile` shows or replaces the profile, and replying to an item asks about it. All of them work only from `TELEGRAM_CHAT_ID`.

To see why items were picked or dropped:

```bash
sqlite3 data/news.sqlite "select llmScore, source, title, rankReason from items where llmScore is not null order by llmScore desc"
```

To redo the advice after changing its prompt: `sqlite3 data/news.sqlite "update items set summary = null, why = null, tryIt = null"`.

To see your votes:

```bash
sqlite3 data/news.sqlite "select f.vote, i.title from feedback f join items i on i.id = f.itemId order by f.updatedAt desc"
```

To start over: delete `data/news.sqlite`. Tables are recreated automatically (`synchronize: true`).

## Notes

- Long polling, so there's no public URL or webhook. It runs anywhere, including a laptop.
- Pinned to Nest 11 / TypeORM 0.3 / TypeScript 5.7. TypeORM 1.x needs Node ≥ 20.19.
