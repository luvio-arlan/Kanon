import type {
  GuidanceBasis,
  GuidanceFiscalPeriod,
  GuidanceMetric,
  GuidanceUnit,
} from "@kanon/core";
import { extractCnAndEnNumbers } from "../../verification/cn-number-units";

function stripPressHtmlToLines(rawHtml: string): string[] {
  return rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:\/p|\/div|\/li|\/tr|\/h[1-6]|br\s*\/?)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 20 && l.length <= 1800);
}

export interface ExtractedPressGuidanceCandidate {
  chunkId: string;
  chunkText: string;
  paraIndex: number;
  metric: GuidanceMetric;
  basis: GuidanceBasis;
  unit: GuidanceUnit;
  currency: "USD";
  targetFiscalYear: number;
  targetFiscalPeriod: GuidanceFiscalPeriod;
  low: number;
  high: number;
  quote: string;
  extractor: "rule/1";
  issuedOn: string;
}

const OUTLOOK_CUE_RE =
  /\b(?:outlook|guidance|expected\s+to\s+be|expects?|anticipates?|projects?)\b/i;

function inferMetric(sentence: string): { metric: GuidanceMetric; unit: GuidanceUnit } | null {
  if (/\bgross\s+margins?\b/i.test(sentence)) return { metric: "gross_margin", unit: "pct" };
  if (/\boperating\s+margins?\b/i.test(sentence))
    return { metric: "operating_margin", unit: "pct" };
  if (/\bdiluted\s+eps\b|\bearnings\s+per\s+(?:diluted\s+)?share\b/i.test(sentence)) {
    return { metric: "diluted_eps", unit: "usd_per_share" };
  }
  if (/\bcapital\s+expenditures?\b|\bcapex\b/i.test(sentence))
    return { metric: "capex", unit: "usd" };
  if (/\boperating\s+expenses?\b|\bopex\b/i.test(sentence)) {
    return { metric: "operating_expenses", unit: "usd" };
  }
  if (/\bfree\s+cash\s+flow\b/i.test(sentence)) return { metric: "free_cash_flow", unit: "usd" };
  if (/\brevenue\b/i.test(sentence)) return { metric: "revenue", unit: "usd" };
  return null;
}

function inferBasis(sentence: string): GuidanceBasis {
  if (/\bnon-?gaap\b/i.test(sentence)) return "non_gaap";
  if (/\bgaap\b/i.test(sentence)) return "gaap";
  return "unspecified";
}

function inferTargetPeriod(
  sentence: string,
  context: string,
): { year: number; period: GuidanceFiscalPeriod } | null {
  const src = `${sentence} ${context}`;
  const qMatch = src.match(/\b(Q[1-4])\s*(?:FY|fiscal(?:\s+year)?)?\s*['’]?(20\d{2})\b/i);
  if (qMatch?.[1] && qMatch[2]) {
    return { period: qMatch[1].toUpperCase() as GuidanceFiscalPeriod, year: Number(qMatch[2]) };
  }
  const wordQ = src.match(
    /\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(?:fiscal(?:\s+year)?\s+)?(20\d{2})\b/i,
  );
  if (wordQ?.[1] && wordQ[2]) {
    const map: Record<string, GuidanceFiscalPeriod> = {
      first: "Q1",
      second: "Q2",
      third: "Q3",
      fourth: "Q4",
    };
    const p = map[wordQ[1].toLowerCase()];
    if (p) return { period: p, year: Number(wordQ[2]) };
  }
  const fyMatch = src.match(/\b(?:full[- ]year|fiscal(?:\s+year)?|FY)\s*['’]?(20\d{2})\b/i);
  if (fyMatch?.[1]) return { period: "FY", year: Number(fyMatch[1]) };
  return null;
}

function parsePlusMinusBounds(
  sentence: string,
  unit: GuidanceUnit,
  nums: ReturnType<typeof extractCnAndEnNumbers>,
): { low: number; high: number } | null {
  const pmPct = sentence.match(/(?:plus\s+or\s+minus|\+\/-|±)\s*(\d+(?:\.\d+)?)\s*%/i);
  if (pmPct?.[1] && unit === "usd") {
    const base = nums.find((n) => n.kind === "scalar" && n.value > 0);
    const tol = Number(pmPct[1]) / 100;
    if (base && Number.isFinite(tol) && tol > 0 && tol < 0.5) {
      return { low: base.value * (1 - tol), high: base.value * (1 + tol) };
    }
  }
  const pmBps = sentence.match(
    /(?:plus\s+or\s+minus|\+\/-|±)\s*(\d+(?:\.\d+)?)\s*(?:basis\s+points|bps)\b/i,
  );
  if (pmBps?.[1] && unit === "pct") {
    const pcts = nums.filter((n) => n.kind === "pct").map((n) => n.value);
    const delta = Number(pmBps[1]) / 100;
    const first = pcts[0];
    if (first !== undefined && Number.isFinite(delta)) {
      return { low: first - delta, high: (pcts[1] ?? first) + delta };
    }
  }
  return null;
}

function parseValueBounds(
  sentence: string,
  unit: GuidanceUnit,
): { low: number; high: number } | null {
  const nums = extractCnAndEnNumbers(sentence);
  const pm = parsePlusMinusBounds(sentence, unit, nums);
  if (pm) return pm;
  const matching = nums
    .filter((n) => (unit === "pct" ? n.kind === "pct" : n.kind === "scalar"))
    .map((n) => n.value)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (matching.length >= 2 && matching[0] !== undefined && matching[1] !== undefined) {
    return { low: Math.min(matching[0], matching[1]), high: Math.max(matching[0], matching[1]) };
  }
  if (matching.length === 1 && matching[0] !== undefined) {
    return { low: matching[0], high: matching[0] };
  }
  return null;
}

function isRangeAnchoredToQuote(quote: string, bounds: { low: number; high: number }): boolean {
  const nums = extractCnAndEnNumbers(quote).map((n) => n.value);
  const tolLo = Math.max(1e-6, Math.abs(bounds.low) * 1e-4);
  const tolHi = Math.max(1e-6, Math.abs(bounds.high) * 1e-4);
  return nums.some((v) => v >= bounds.low - tolLo && v <= bounds.high + tolHi);
}

function tryExtractSentenceCandidate(params: {
  chunk: { id: string; paraIndex: number; text: string };
  rawSentence: string;
  rollingContext: string;
  issuedOn: string;
}): ExtractedPressGuidanceCandidate | null {
  const sentence = params.rawSentence.trim();
  if (!OUTLOOK_CUE_RE.test(sentence)) return null;
  const m = inferMetric(sentence);
  const period = m ? inferTargetPeriod(sentence, params.rollingContext) : null;
  const bounds = m && period ? parseValueBounds(sentence, m.unit) : null;
  if (!m || !period || !bounds) return null;
  if (!params.chunk.text.includes(sentence) || !isRangeAnchoredToQuote(sentence, bounds)) {
    return null;
  }
  return {
    chunkId: params.chunk.id,
    chunkText: params.chunk.text,
    paraIndex: params.chunk.paraIndex,
    metric: m.metric,
    basis: inferBasis(sentence),
    unit: m.unit,
    currency: "USD",
    targetFiscalYear: period.year,
    targetFiscalPeriod: period.period,
    low: bounds.low,
    high: bounds.high,
    quote: sentence.slice(0, 600),
    extractor: "rule/1",
    issuedOn: params.issuedOn,
  };
}

/** Rule-based, zero-hallucination 8-K Ex-99.1 guidance candidate extractor (U1-2). */
export function extractPressReleaseGuidanceCandidates(params: {
  accession: string;
  issuedOn: string;
  html: string;
}): {
  chunks: Array<{ id: string; paraIndex: number; text: string }>;
  candidates: ExtractedPressGuidanceCandidate[];
} {
  const paras = stripPressHtmlToLines(params.html).slice(0, 120);
  const chunks = paras.map((text, idx) => ({
    id: `${params.accession}:ex99_1:${idx}`,
    paraIndex: idx,
    text,
  }));
  const candidates: ExtractedPressGuidanceCandidate[] = [];
  let rollingContext = "";
  for (const chunk of chunks) {
    if (/\b(?:outlook|guidance|quarter\s+of\s+fiscal|Q[1-4]\s*20\d{2})\b/i.test(chunk.text)) {
      rollingContext = chunk.text.slice(0, 240);
    }
    const sentences = chunk.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length >= 16);
    for (const rawSentence of sentences) {
      const cand = tryExtractSentenceCandidate({
        chunk,
        rawSentence,
        rollingContext,
        issuedOn: params.issuedOn,
      });
      if (cand) candidates.push(cand);
    }
  }
  return { chunks, candidates };
}
