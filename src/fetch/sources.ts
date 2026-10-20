/**
 * RSS / Atom feeds to pull from. Add or remove freely.
 *
 * `weight` is the v0 ranking score for every item from that feed (HN items use their
 * points instead, which are usually 100–1000). Higher weight = more likely to make the digest.
 */
export interface RssSource {
  key: string;
  name: string;
  url: string;
  weight: number;
}

export const RSS_SOURCES: RssSource[] = [
  { key: 'simonwillison', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', weight: 300 },
  { key: 'openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', weight: 250 },
  { key: 'deepmind', name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', weight: 350 },
  { key: 'huggingface', name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', weight: 250 },
  { key: 'latentspace', name: 'Latent Space', url: 'https://www.latent.space/feed', weight: 300 },
  { key: 'importai', name: 'Import AI', url: 'https://importai.substack.com/feed', weight: 300 },
  { key: 'pragmatic', name: 'The Pragmatic Engineer', url: 'https://newsletter.pragmaticengineer.com/feed', weight: 300 },
  { key: 'fowler', name: 'Martin Fowler', url: 'https://martinfowler.com/feed.atom', weight: 250 },
  { key: 'github', name: 'GitHub Blog', url: 'https://github.blog/feed/', weight: 150 },
];

/**
 * Hacker News front page is mostly off-topic for us, so v0 keeps only stories whose title
 * matches one of these (whole word, case-insensitive). v2 replaces this with LLM scoring.
 */
export const HN_KEYWORDS = [
  'ai', 'llm', 'llms', 'gpt', 'claude', 'gemini', 'llama', 'openai', 'anthropic', 'model', 'models',
  'agent', 'agents', 'rag', 'embedding', 'embeddings', 'inference', 'transformer', 'neural',
  'typescript', 'javascript', 'node', 'rust', 'go', 'python', 'postgres', 'sqlite', 'database',
  'compiler', 'kubernetes', 'programming', 'software', 'engineer', 'engineering', 'developer',
  'api', 'open source', 'github', 'security', 'vulnerability',
];

export const HN_MIN_POINTS = 100;
