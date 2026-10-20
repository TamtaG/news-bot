/** What every fetcher returns — the common shape before it's stored. */
export interface FetchedItem {
  source: string;
  url: string;
  title: string;
  snippet: string | null;
  score: number;
  discussionUrl: string | null;
  publishedAt: Date | null;
}
