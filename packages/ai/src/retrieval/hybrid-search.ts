import { expandBilingualFinanceQuery } from "../agent/filing-search-tool";

export interface SearchableFilingChunk {
  id: string;
  accession: string;
  sectionCode: string;
  paraIndex: number;
  text: string;
  documentUrl?: string;
  embedding?: readonly number[];
}

export interface HybridSearchHit {
  chunk: SearchableFilingChunk;
  rrfScore: number;
  bm25Score: number;
  vectorScore: number | null;
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
  return expandBilingualFinanceQuery(text).filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function tokenizeDocument(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
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

/**
 * Hybrid BM25 + optional vector similarity retrieval fused via Reciprocal Rank Fusion (RRF, k=60).
 */
export function hybridSearchChunks(params: {
  query: string;
  chunks: readonly SearchableFilingChunk[];
  queryEmbedding?: readonly number[];
  topK?: number;
}): HybridSearchHit[] {
  const { query, chunks, queryEmbedding } = params;
  const topK = Math.max(1, Math.min(25, params.topK ?? 8));
  if (chunks.length === 0) return [];
  const queryTerms = tokenizeQuery(query);
  const tokenizedDocs = chunks.map((c) => tokenizeDocument(c.text));
  const avgLen =
    tokenizedDocs.reduce((acc, d) => acc + d.length, 0) / Math.max(1, tokenizedDocs.length);
  const df = new Map<string, number>();
  for (const doc of tokenizedDocs) {
    for (const uniq of new Set(doc)) df.set(uniq, (df.get(uniq) ?? 0) + 1);
  }

  const scored = chunks.map((chunk, idx) => {
    const bm25 = scoreBm25Chunk(queryTerms, tokenizedDocs[idx] ?? [], avgLen, df, chunks.length);
    const vec =
      queryEmbedding && chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : null;
    return { chunk, bm25, vec };
  });

  const lexOrder = [...scored].sort((a, b) => b.bm25 - a.bm25);
  const lexRank = new Map(lexOrder.map((item, i) => [item.chunk.id, i + 1]));
  const hasVec = scored.some((s) => s.vec !== null);
  const vecOrder = hasVec ? [...scored].sort((a, b) => (b.vec ?? -1) - (a.vec ?? -1)) : [];
  const vecRank = new Map(vecOrder.map((item, i) => [item.chunk.id, i + 1]));

  const k = 60;
  return scored
    .filter((s) => s.bm25 > 0 || (s.vec !== null && s.vec > 0.25))
    .map((s) => {
      const lr = lexRank.get(s.chunk.id) ?? chunks.length;
      const vr = vecRank.get(s.chunk.id);
      const rrfScore = 1 / (k + lr) + (vr ? 1 / (k + vr) : 0);
      return {
        chunk: s.chunk,
        rrfScore,
        bm25Score: s.bm25,
        vectorScore: s.vec,
        deepLinkUrl: buildSecTextFragmentUrl(s.chunk.documentUrl, s.chunk.text),
      };
    })
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
}
