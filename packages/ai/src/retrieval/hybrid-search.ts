import { planBilingualQuery } from "./query-plan";

export interface SearchableFilingChunk {
  id: string;
  accession: string;
  sectionCode: string;
  paraIndex: number;
  text: string;
  documentUrl?: string;
}

export interface HybridSearchHit {
  chunk: SearchableFilingChunk;
  rrfScore: number;
  bm25Score: number;
  deepLinkUrl: string | null;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "have",
  "will",
  "were",
  "are",
  "our",
  "was",
  "not",
  "its",
  "has",
  "had",
]);

function tokenizeQuery(text: string): string[] {
  const plan = planBilingualQuery(text);
  const tokens = new Set<string>();
  for (const phrase of plan.englishTerms) {
    for (const tok of phrase.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 2 && !STOP_WORDS.has(tok)) tokens.add(tok);
    }
  }
  for (const tok of text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (tok.length >= 2 && !STOP_WORDS.has(tok)) tokens.add(tok);
  }
  return [...tokens];
}

function tokenizeDocument(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function scoreBm25Chunk(
  queryTerms: readonly string[],
  docTerms: readonly string[],
  avgDocLen: number,
  df: ReadonlyMap<string, number>,
  totalDocs: number,
): number {
  const k1 = 1.2;
  const b = 0.75;
  const tf = new Map<string, number>();
  for (const t of docTerms) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const term of queryTerms) {
    const freq = tf.get(term) ?? 0;
    if (freq === 0) continue;
    const docFreq = df.get(term) ?? 0;
    const idf = Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
    const norm = freq + k1 * (1 - b + (b * docTerms.length) / Math.max(1, avgDocLen));
    score += idf * ((freq * (k1 + 1)) / norm);
  }
  return score;
}

/** Builds a browser-native `#:~:text=` deep link pointing to the cited excerpt inside an SEC filing. */
export function buildSecTextFragmentUrl(
  documentUrl: string | undefined,
  text: string,
): string | null {
  if (!documentUrl?.startsWith("https://")) return null;
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length < 4) return documentUrl;
  const fragment = words.slice(0, Math.min(8, words.length)).join(" ");
  return `${documentUrl.split("#")[0]}#:~:text=${encodeURIComponent(fragment)}`;
}

/** Pure BM25 bilingual reranker over FTS/filing candidate chunks (vector branch removed per R4). */
export function hybridSearchChunks(params: {
  query: string;
  chunks: readonly SearchableFilingChunk[];
  topK?: number;
}): HybridSearchHit[] {
  const { query, chunks } = params;
  const topK = Math.max(1, Math.min(25, params.topK ?? 6));
  if (chunks.length === 0) return [];
  const queryTerms = tokenizeQuery(query);
  const tokenizedDocs = chunks.map((c) => tokenizeDocument(c.text));
  const avgLen =
    tokenizedDocs.reduce((acc, d) => acc + d.length, 0) / Math.max(1, tokenizedDocs.length);
  const df = new Map<string, number>();
  for (const doc of tokenizedDocs) {
    for (const uniq of new Set(doc)) df.set(uniq, (df.get(uniq) ?? 0) + 1);
  }

  return chunks
    .map((chunk, idx) => ({
      chunk,
      bm25Score: scoreBm25Chunk(queryTerms, tokenizedDocs[idx] ?? [], avgLen, df, chunks.length),
    }))
    .filter((s) => s.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, topK)
    .map((s, rank) => ({
      chunk: s.chunk,
      bm25Score: s.bm25Score,
      rrfScore: 1 / (60 + rank + 1),
      deepLinkUrl: buildSecTextFragmentUrl(s.chunk.documentUrl, s.chunk.text),
    }));
}
