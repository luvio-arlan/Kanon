import type {
  GuidanceBasis,
  GuidanceFiscalPeriod,
  GuidanceMetric,
  GuidanceUnit,
} from "@kanon/core";
import { extractCnAndEnNumbers } from "../../verification/cn-number-units";
import { extractBasisBounds } from "./press-basis-split";
import {
  decodeHtmlEntities,
  inferTargetPeriod,
  nextPeriodContext,
  type TargetPeriod,
} from "./press-period-context";

/** Bumped whenever extraction semantics change; stored per candidate so stale rows can be superseded. */
export const PRESS_RULE_VERSION = 2;
const MAX_PRESS_LINES = 400;

function stripPressHtmlToLines(rawHtml: string): string[] {
  const text = rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:\/p|\/div|\/li|\/tr|\/h[1-6]|br\s*\/?)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text)
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
  ruleVersion: number;
  issuedOn: string;
}

const OUTLOOK_CUE_RE =
  /\b(?:outlook|guidance|expected\s+to\s+be|expects?|anticipates?|projects?)\b/i;

const METRIC_RULES: ReadonlyArray<[RegExp, GuidanceMetric, GuidanceUnit]> = [
  [/\bgross\s+margins?\b/i, "gross_margin", "pct"],
  [/\boperating\s+margins?\b/i, "operating_margin", "pct"],
  [/\bdiluted\s+eps\b|\bearnings\s+per\s+(?:diluted\s+)?share\b/i, "diluted_eps", "usd_per_share"],
  [/\bcapital\s+expenditures?\b|\bcapex\b/i, "capex", "usd"],
  [/\boperating\s+expenses?\b|\bopex\b/i, "operating_expenses", "usd"],
  [/\bfree\s+cash\s+flow\b/i, "free_cash_flow", "usd"],
  [/\brevenue\b/i, "revenue", "usd"],
];

function inferMetric(sentence: string): { metric: GuidanceMetric; unit: GuidanceUnit } | null {
  const hit = METRIC_RULES.find(([re]) => re.test(sentence));
  return hit ? { metric: hit[1], unit: hit[2] } : null;
}

/** Every bound must be backed by a number literally present in the quote (zero-hallucination anchor). */
function isAnchoredToQuote(quote: string, low: number, high: number): boolean {
  const nums = extractCnAndEnNumbers(quote).map((n) => n.value);
  const tol = (v: number) => Math.max(1e-6, Math.abs(v) * 1e-4);
  return nums.some((v) => v >= low - tol(low) && v <= high + tol(high));
}

function extractSentenceCandidates(params: {
  chunk: { id: string; paraIndex: number; text: string };
  sentence: string;
  context: TargetPeriod | null;
  issuedOn: string;
}): ExtractedPressGuidanceCandidate[] {
  const { chunk, sentence } = params;
  if (!OUTLOOK_CUE_RE.test(sentence)) return [];
  const m = inferMetric(sentence);
  const period = inferTargetPeriod(sentence) ?? params.context;
  const bounds = m && period ? extractBasisBounds(sentence, m.unit) : null;
  if (!m || !period || !bounds) return [];
  return bounds
    .filter((b) => b.low <= b.high && isAnchoredToQuote(sentence, b.low, b.high))
    .map((b) => ({
      chunkId: chunk.id,
      chunkText: chunk.text,
      paraIndex: chunk.paraIndex,
      metric: m.metric,
      basis: b.basis,
      unit: m.unit,
      currency: "USD" as const,
      targetFiscalYear: period.year,
      targetFiscalPeriod: period.period,
      low: b.low,
      high: b.high,
      quote: sentence.slice(0, 600),
      extractor: "rule/1" as const,
      ruleVersion: PRESS_RULE_VERSION,
      issuedOn: params.issuedOn,
    }));
}

/** Rule-based, zero-hallucination 8-K Ex-99.1 guidance candidate extractor (U1-2 / V1-1). */
export function extractPressReleaseGuidanceCandidates(params: {
  accession: string;
  issuedOn: string;
  html: string;
}): {
  chunks: Array<{ id: string; paraIndex: number; text: string }>;
  candidates: ExtractedPressGuidanceCandidate[];
} {
  const lines = stripPressHtmlToLines(params.html).slice(0, MAX_PRESS_LINES);
  const chunks = lines.map((text, idx) => ({
    id: `${params.accession}:ex99_1:${idx}`,
    paraIndex: idx,
    text,
  }));
  const candidates: ExtractedPressGuidanceCandidate[] = [];
  let context: TargetPeriod | null = null;
  for (const chunk of chunks) {
    context = nextPeriodContext(context, chunk.text);
    const sentences = chunk.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length >= 16);
    for (const sentence of sentences) {
      candidates.push(
        ...extractSentenceCandidates({ chunk, sentence, context, issuedOn: params.issuedOn }),
      );
    }
  }
  return { chunks, candidates };
}
