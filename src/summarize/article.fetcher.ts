import { Injectable, Logger } from '@nestjs/common';
import { Item } from '../items/item.entity';
import { ItemsService } from '../items/items.service';

/** Enough text for a good 2-sentence summary, without paying for whole long-reads. */
const MAX_CHARS = 8_000;
const MAX_BYTES = 2_000_000;

/**
 * Downloads a page and turns it into rough plain text for the LLM.
 *
 * Deliberately crude (regexes, no DOM parser): the model copes fine with some leftover
 * menu text. If this ever isn't good enough, swap in @mozilla/readability + jsdom.
 */
@Injectable()
export class ArticleFetcher {
  private readonly logger = new Logger(ArticleFetcher.name);

  constructor(private readonly items: ItemsService) {}

  /** The item's page as text: from the DB if fetched before, otherwise fetched now and saved. */
  async pageText(item: Item): Promise<string | null> {
    if (item.articleText) return item.articleText;
    const text = await this.fetchText(item.url);
    if (text) {
      item.articleText = text;
      await this.items.saveArticleText(item.id, text);
    }
    return text;
  }

  async fetchText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'news-bot/0.1 (personal digest)' },
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('text/html')) return null; // PDFs, videos, 403s…
      if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return null;

      const text = htmlToText(await res.text());
      return text.length >= 200 ? text.slice(0, MAX_CHARS) : null;
    } catch (err) {
      this.logger.warn(`Could not fetch ${url}: ${(err as Error).message}`);
      return null;
    }
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(rsquo|lsquo);/g, "'")
    .replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&(mdash|ndash);/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
