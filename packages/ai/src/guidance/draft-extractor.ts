import { type GuidanceDraft, GuidanceDraftSchema } from "@kanon/core";
import { verifyGuidanceQuoteAnchor } from "./quote-anchor";

export interface GuidanceDraftExtractionResult {
  accepted: GuidanceDraft[];
  rejectedCount: number;
  model: string;
  promptVersion: string;
}

const PCT_RANGE_RE =
  /([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)?\s*(?:to|–|-|~|至)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:%|percent)/i;
const USD_B_RANGE_RE =
  /\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:billion|b)?\s*(?:to|–|-|~|至)\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:billion|b)\b/i;
const PERIOD_RE = /\bFY\s*(\d{2,4})\s*(Q[1-4])?\b/i;

function inferMetricFromSentence(sentence: string): GuidanceDraft["metric"] | null {
  if (/gross\s+margin|毛利率/i.test(sentence)) return "gross_margin";
  if (/operating\s+margin|营业利润率/i.test(sentence)) return "operating_margin";
  if (/revenue|sales|营收|收入/i.test(sentence)) return "revenue";
  if (/eps|每股收益/i.test(sentence)) return "diluted_eps";
  if (/capex|capital\s+expenditure|资本开支/i.test(sentence)) return "capex";
  if (/free\s+cash\s+flow|自由现金流/i.test(sentence)) return "free_cash_flow";
  return null;
}

function parseFiscalPeriod(sentence: string): {
  fy: number | null;
  fp: GuidanceDraft["targetFiscalPeriod"];
} {
  const m = PERIOD_RE.exec(sentence);
  if (!m?.[1]) return { fy: null, fp: null };
  const rawYr = Number(m[1]);
  const fy = rawYr < 100 ? 2000 + rawYr : rawYr;
  const fp = (m[2]?.toUpperCase() ?? "FY") as GuidanceDraft["targetFiscalPeriod"];
  return { fy, fp };
}

function parseSentenceCandidate(sentence: string): GuidanceDraft | null {
  if (sentence.length < 16 || sentence.length > 580) return null;
  const metric = inferMetricFromSentence(sentence);
  if (!metric) return null;
  const { fy, fp } = parseFiscalPeriod(sentence);
  const basis = /non-gaap/i.test(sentence)
    ? "non_gaap"
    : /gaap/i.test(sentence)
      ? "gaap"
      : "unspecified";
  const pctMatch = PCT_RANGE_RE.exec(sentence);
  if (
    pctMatch?.[1] &&
    pctMatch[2] &&
    (metric === "gross_margin" || metric === "operating_margin")
  ) {
    return {
      metric,
      basis,
      unit: "pct",
      targetFiscalYear: fy,
      targetFiscalPeriod: fp,
      low: Number(pctMatch[1]),
      high: Number(pctMatch[2]),
      quote: sentence,
    };
  }
  const usdMatch = USD_B_RANGE_RE.exec(sentence);
  const isUsdMetric = metric === "revenue" || metric === "capex" || metric === "free_cash_flow";
  if (usdMatch?.[1] && usdMatch[2] && isUsdMetric) {
    return {
      metric,
      basis,
      unit: "usd",
      targetFiscalYear: fy,
      targetFiscalPeriod: fp,
      low: Number(usdMatch[1]) * 1e9,
      high: Number(usdMatch[2]) * 1e9,
      quote: sentence,
    };
  }
  return null;
}

function extractLocalCandidates(sourceText: string): GuidanceDraft[] {
  const candidates: GuidanceDraft[] = [];
  for (const rawSentence of sourceText.split(/(?<=[.!?。！？])\s+|\n+/)) {
    const parsed = parseSentenceCandidate(rawSentence.trim());
    if (parsed) candidates.push(parsed);
  }
  return candidates.slice(0, 12);
}

/** Validates raw candidate drafts against `GuidanceDraftSchema` and verbatim `verifyGuidanceQuoteAnchor` (R3). */
export function filterAnchoredGuidanceDrafts(
  sourceText: string,
  rawDrafts: readonly unknown[],
): { accepted: GuidanceDraft[]; rejectedCount: number } {
  const accepted: GuidanceDraft[] = [];
  let rejectedCount = 0;
  for (const item of rawDrafts.slice(0, 12)) {
    const parsed = GuidanceDraftSchema.safeParse(item);
    if (!parsed.success || !verifyGuidanceQuoteAnchor(sourceText, parsed.data).ok) {
      rejectedCount += 1;
      continue;
    }
    accepted.push(parsed.data);
  }
  return { accepted, rejectedCount };
}

/** Extracts anchored management guidance drafts from a research note or transcript excerpt (R3). */
export function extractGuidanceDraftsFromText(sourceText: string): GuidanceDraftExtractionResult {
  const raw = extractLocalCandidates(sourceText);
  const { accepted, rejectedCount } = filterAnchoredGuidanceDrafts(sourceText, raw);
  return {
    accepted,
    rejectedCount,
    model: "grounded-local-extractor",
    promptVersion: "guidance/1",
  };
}
