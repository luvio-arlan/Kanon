import { countSharedContentWords } from "./citation-relevance";
import { extractCnAndEnNumbers, sanitizeFormTokens } from "./cn-number-units";
import { type PeriodTag, parseNearbyPeriod, periodsCompatible } from "./period-binding";

export interface GroundedClaimInput {
  text: string;
  citations: readonly string[];
}

export interface VerifiedClaimResult {
  text: string;
  citations: readonly string[];
  status: "verified" | "unverified";
  issues: string[];
}

export interface GroundingVerificationReport {
  totalClaims: number;
  verifiedClaims: number;
  unverifiedClaims: number;
  groundingRatePct: number | null;
  results: VerifiedClaimResult[];
}

export interface ConceptFactValue {
  concept: string;
  value: number;
  kind: "pct" | "scalar";
  fiscalYear?: number | null;
  fiscalPeriod?: PeriodTag["fp"];
}

interface NormalizedNumber {
  raw: string;
  value: number;
  kind: "pct" | "scalar";
  concept: string | null;
  period: PeriodTag | null;
  fromCitedChunk: boolean;
}

const CONCEPT_CUES: ReadonlyArray<readonly [RegExp, string]> = [
  [/毛利率|gross\s+margin/i, "gross_margin"],
  [/税率|tax\s+rate/i, "tax_rate"],
  [/营业利润率|经营利润率|operating\s+margin|ebit\s+margin/i, "operating_margin"],
  [/净利率|net\s+margin/i, "net_margin"],
  [/营收|营业收入|收入|revenue|sales/i, "revenue"],
  [/净利润|net\s+income/i, "net_income"],
  [/自由现金流|fcf|free\s+cash\s+flow/i, "free_cash_flow"],
  [/eps|每股收益|per\s+share/i, "diluted_eps"],
  [/roic|投入资本回报/i, "roic"],
  [/roe|净资产收益/i, "roe"],
  [/wacc|折现率/i, "wacc"],
];

function isBetterPos(pos: number, bestPos: number, pickLast: boolean): boolean {
  return pickLast ? pos > bestPos : pos < bestPos;
}

function matchClosestCue(slice: string, pickLast: boolean): string | null {
  let best: { concept: string; pos: number } | null = null;
  for (const [re, concept] of CONCEPT_CUES) {
    const m = slice.match(re);
    if (m?.index === undefined) continue;
    const pos = pickLast ? m.index + m[0].length : m.index;
    if (!best || isBetterPos(pos, best.pos, pickLast)) best = { concept, pos };
  }
  return best?.concept ?? null;
}

function inferNearbyConcept(text: string, index: number, radius = 32): string | null {
  const before = text.slice(Math.max(0, index - radius), index);
  const beforeCue = matchClosestCue(before, true);
  if (beforeCue) return beforeCue;
  const after = text.slice(index, Math.min(text.length, index + Math.round(radius * 0.75)));
  return matchClosestCue(after, false);
}

/** Extracts normalized English/Chinese numbers with nearby concept & fiscal period tags (R4). */
export function extractNormalizedNumbers(text: string, fromCitedChunk = false): NormalizedNumber[] {
  const sanitized = sanitizeFormTokens(text);
  const radius = fromCitedChunk ? 64 : 32;
  return extractCnAndEnNumbers(text).map((tok) => ({
    raw: tok.raw,
    value: tok.value,
    kind: tok.kind,
    concept: inferNearbyConcept(sanitized, tok.index, radius),
    period: parseNearbyPeriod(sanitized, tok.index),
    fromCitedChunk,
  }));
}

function isWithinTolerance(target: NormalizedNumber, cand: NormalizedNumber): boolean {
  const absDiff = Math.abs(target.value - cand.value);
  if (target.kind === "pct") return absDiff <= 0.25;
  return absDiff / Math.max(Math.abs(target.value), Math.abs(cand.value), 1) <= 0.02;
}

function checkNumberAgainstPool(
  target: NormalizedNumber,
  pool: readonly NormalizedNumber[],
): "ok" | "period_mismatch" | "unmatched" {
  let sawValueMatch = false;
  for (const cand of pool) {
    if (cand.kind !== target.kind || !isWithinTolerance(target, cand)) continue;
    // R4 strict concept binding: if claim has concept, candidate must carry the SAME concept
    // (either structured fact or within ±64 chars inside the cited chunk).
    if (target.concept !== null && cand.concept !== target.concept) continue;
    sawValueMatch = true;
    if (periodsCompatible(target.period, cand.period)) return "ok";
  }
  return sawValueMatch ? "period_mismatch" : "unmatched";
}

function verifySingleClaim(
  claim: GroundedClaimInput,
  knownNumbers: readonly NormalizedNumber[],
  chunkMap: ReadonlyMap<string, string>,
): VerifiedClaimResult {
  const issues: string[] = [];
  if (claim.citations.length === 0) issues.push("缺少证据引用锚点");
  const citedPool: NormalizedNumber[] = [...knownNumbers];
  for (const cid of claim.citations) {
    const chunkText = chunkMap.get(cid);
    if (chunkText === undefined) {
      issues.push(`引用编号 ${cid} 不存在于当前检索证据池`);
      continue;
    }
    if (countSharedContentWords(claim.text, chunkText) < 2) {
      issues.push("引用与论述不相关");
    }
    citedPool.push(...extractNormalizedNumbers(chunkText, true));
  }
  for (const num of extractNormalizedNumbers(claim.text, false)) {
    const match = checkNumberAgainstPool(num, citedPool);
    if (match === "period_mismatch") {
      issues.push(`数值「${num.raw}」数值期间与证据不符`);
    } else if (match === "unmatched") {
      issues.push(`数值「${num.raw}」未在引用原文或匹配概念事实中核验通过`);
    }
  }
  return {
    text: claim.text,
    citations: claim.citations,
    status: issues.length === 0 ? "verified" : "unverified",
    issues,
  };
}

/**
 * Upgraded deterministic claim grounding verifier (R4):
 * - 0 claims -> `groundingRatePct: null` (never 100%)
 * - Period-bound numeric checks (`FY2023` != `FY2024`)
 * - Bilingual citation relevance (>= 2 shared content words)
 * - Chinese magnitude & bps units
 * - No untagged global fact pool bypass
 */
export function verifyGroundedClaims(params: {
  claims: readonly GroundedClaimInput[];
  knownFactValues?: readonly number[];
  knownFactPcts?: readonly number[];
  knownConceptFacts?: readonly ConceptFactValue[];
  chunkMap: ReadonlyMap<string, string>;
}): GroundingVerificationReport {
  const knownNumbers: NormalizedNumber[] = (params.knownConceptFacts ?? [])
    .filter((f) => Number.isFinite(f.value))
    .map((f) => ({
      raw: String(f.value),
      value: f.value,
      kind: f.kind,
      concept: f.concept,
      period:
        f.fiscalYear !== undefined || f.fiscalPeriod !== undefined
          ? { fy: f.fiscalYear ?? null, fp: f.fiscalPeriod ?? null }
          : null,
      fromCitedChunk: false,
    }));
  const results = params.claims.map((c) => verifySingleClaim(c, knownNumbers, params.chunkMap));
  const verifiedClaims = results.filter((r) => r.status === "verified").length;
  const totalClaims = results.length;
  return {
    totalClaims,
    verifiedClaims,
    unverifiedClaims: totalClaims - verifiedClaims,
    groundingRatePct: totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 100) : null,
    results,
  };
}
