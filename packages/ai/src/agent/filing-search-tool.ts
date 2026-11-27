import type { ResearchNote, SecFilingReaderResponse, ThesisDetail } from "@kanon/core";
import { expandLexiconTerms } from "../retrieval/fin-lexicon";
import { countBuySideSignals } from "../sec/filing-text-parser";
import type { ResearchToolOutput } from "./types";

export interface FilingExcerptMatch {
  score: number;
  text: string;
  citation: string;
}

function tokenizeText(raw: string): string[] {
  const parts = raw
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .filter((t) => t.length >= 2);
  const tokens: string[] = [];
  for (const part of parts) {
    tokens.push(part);
    if (/^[\u4e00-\u9fff]{3,}$/.test(part)) {
      for (let i = 0; i < part.length - 1; i += 1) {
        tokens.push(part.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

export function expandBilingualFinanceQuery(raw: string): string[] {
  const base = tokenizeText(raw);
  const expanded = new Set(base);
  const lex = expandLexiconTerms(raw);
  for (const phrase of lex.englishTerms) {
    for (const w of phrase
      .replaceAll('"', "")
      .toLowerCase()
      .split(/[^a-z0-9-]+/)) {
      if (w.length >= 2) expanded.add(w);
    }
  }
  return [...expanded];
}

function appendFilingChunks(
  doc: SecFilingReaderResponse,
  chunks: Array<{ text: string; citation: string }>,
) {
  for (const sec of doc.sections) {
    sec.paragraphs.forEach((para, idx) => {
      chunks.push({
        text: para,
        citation: `${doc.form} (${doc.filingDate}) · ${sec.heading} · ¶${idx + 1}`,
      });
    });
  }
  for (const added of doc.diff?.addedSnippets ?? []) {
    chunks.push({ text: added, citation: `${doc.form} (${doc.filingDate}) · 跨期新增措辞` });
  }
}

function appendNoteChunks(note: ResearchNote, chunks: Array<{ text: string; citation: string }>) {
  const label = `${note.periodLabel} · ${note.title}`;
  for (const line of note.content.split(/\n+/).map((l) => l.trim())) {
    if (line.length >= 20) chunks.push({ text: line, citation: label });
  }
  if (note.guidancePromised.trim()) {
    chunks.push({
      text: `指引指标 ${note.guidanceMetric}：承诺 ${note.guidancePromised}；兑现 ${note.guidanceDelivered || "待追踪"}`,
      citation: `${label} · 指引兑现`,
    });
  }
}

function buildSearchCorpus(
  filings: readonly SecFilingReaderResponse[],
  sourceText?: string,
  researchNotes?: readonly ResearchNote[],
): Array<{ text: string; citation: string }> {
  const chunks: Array<{ text: string; citation: string }> = [];
  for (const doc of filings) appendFilingChunks(doc, chunks);
  for (const note of researchNotes ?? []) appendNoteChunks(note, chunks);
  if (!sourceText?.trim()) return chunks;
  for (const line of sourceText.split(/\n+/).map((l) => l.trim())) {
    if (line.length >= 25) chunks.push({ text: line, citation: "电话会 / 一阶粘贴原文" });
  }
  return chunks;
}

function scoreBm25Lite(
  text: string,
  queryTerms: readonly string[],
  avgDocLen: number,
  idfMap: ReadonlyMap<string, number>,
): number {
  const lower = text.toLowerCase();
  const docTokens = tokenizeText(lower);
  if (docTokens.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const tok of docTokens) freq.set(tok, (freq.get(tok) ?? 0) + 1);

  const k1 = 1.4;
  const b = 0.65;
  let score = 0;
  for (const q of queryTerms) {
    const tf = freq.get(q) ?? (lower.includes(q) ? 0.6 : 0);
    if (tf <= 0) continue;
    const idf = idfMap.get(q) ?? 1;
    const norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * docTokens.length) / avgDocLen));
    score += idf * norm;
  }
  if (score <= 0) return 0;
  return score + Math.min(2, countBuySideSignals(text) * 0.35);
}

export function searchFilingExcerpts(params: {
  query: string;
  filings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  sourceText?: string;
  limit?: number;
}): FilingExcerptMatch[] {
  const corpus = buildSearchCorpus(params.filings ?? [], params.sourceText, params.researchNotes);
  if (corpus.length === 0) return [];
  const terms = expandBilingualFinanceQuery(params.query);
  if (terms.length === 0) return [];

  const docLens = corpus.map((c) => Math.max(8, tokenizeText(c.text).length));
  const avgLen = docLens.reduce((s, l) => s + l, 0) / corpus.length;
  const idfMap = new Map<string, number>();
  for (const q of terms) {
    const df = corpus.filter((c) => c.text.toLowerCase().includes(q)).length;
    idfMap.set(q, Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5)));
  }

  return corpus
    .map((item) => ({
      text: item.text,
      citation: item.citation,
      score: scoreBm25Lite(item.text, terms, avgLen, idfMap),
    }))
    .filter((m) => m.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, params.limit ?? 4);
}

export function runFilingExcerptsTool(params: {
  thesis: ThesisDetail;
  cachedFilings?: readonly SecFilingReaderResponse[];
  researchNotes?: readonly ResearchNote[];
  sourceText?: string;
}): ResearchToolOutput {
  const query = [
    params.thesis.ticker,
    params.thesis.businessFilter.keyDebate,
    params.thesis.businessFilter.variantPerception,
    ...params.thesis.hypotheses.map((h) => `${h.title} ${h.metricLabel}`),
    "gross margin capex guidance backlog inventory demand",
  ].join(" ");
  const hits = searchFilingExcerpts({
    query,
    filings: params.cachedFilings,
    researchNotes: params.researchNotes,
    sourceText: params.sourceText,
    limit: 3,
  });
  if (hits.length === 0) {
    return {
      finding: `尚未缓存 ${params.thesis.ticker} 的 10-K/10-Q 正文或电话会纪要；建议在 Step 3 归档一手资料或直拉原文后重跑审计。`,
      citation: `SEC 原文检索引擎 · ${params.thesis.ticker}（待缓存）`,
    };
  }
  const summary = hits
    .map((h, i) => `(${i + 1}) [${h.citation}] ${h.text.slice(0, 140)}…`)
    .join(" ");
  return {
    finding: `跨语种检索命中 ${hits.length} 条一手原文段落：${summary}`,
    citation: hits[0]?.citation ?? `${params.thesis.ticker} SEC Filing`,
  };
}
