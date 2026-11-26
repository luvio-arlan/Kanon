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
  groundingRatePct: number;
  results: VerifiedClaimResult[];
}

export interface ConceptFactValue {
  concept: string;
  value: number;
  kind: "pct" | "scalar";
}

interface NormalizedNumber {
  raw: string;
  value: number;
  kind: "pct" | "scalar";
  concept: string | null;
}

const UNIT_MULTIPLIER: Record<string, number> = {
  t: 1e12,
  trillion: 1e12,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  k: 1e3,
  亿: 1e8,
};

const SEC_FORM_TOKEN_RE =
  /\b(?:10-K\/A|10-Q\/A|20-F\/A|10-K|10-Q|8-K|20-F|6-K|DEF\s*14A|S-1|Form\s+4|Item\s+\d+(?:\.\d+)?)\b/gi;

const CONCEPT_CUES: ReadonlyArray<readonly [RegExp, string]> = [
  [/毛利率|gross\s+margin/i, "gross_margin"],
  [/税率|tax\s+rate/i, "tax_rate"],
  [/营业利润率|operating\s+margin|ebit\s+margin/i, "operating_margin"],
  [/净利率|net\s+margin/i, "net_margin"],
  [/营收|营业收入|revenue/i, "revenue"],
  [/净利润|net\s+income/i, "net_income"],
  [/自由现金流|fcf|free\s+cash\s+flow/i, "free_cash_flow"],
  [/eps|每股收益/i, "diluted_eps"],
  [/roic|投入资本回报/i, "roic"],
  [/roe|净资产收益/i, "roe"],
  [/wacc|折现率/i, "wacc"],
];

function isCloserCue(
  best: { concept: string; pos: number } | null,
  pos: number,
  pickLast: boolean,
): boolean {
  if (!best) return true;
  return pickLast ? pos > best.pos : pos < best.pos;
}

function matchClosestCue(slice: string, pickLast: boolean): string | null {
  let best: { concept: string; pos: number } | null = null;
  for (const [re, concept] of CONCEPT_CUES) {
    const m = slice.match(re);
    if (!m || m.index === undefined) continue;
    const pos = pickLast ? m.index + m[0].length : m.index;
    if (isCloserCue(best, pos, pickLast)) best = { concept, pos };
  }
  return best?.concept ?? null;
}

function inferNearbyConcept(text: string, index: number): string | null {
  const before = text.slice(Math.max(0, index - 32), index);
  const beforeCue = matchClosestCue(before, true);
  if (beforeCue) return beforeCue;
  const after = text.slice(index, Math.min(text.length, index + 16));
  return matchClosestCue(after, false);
}

function toNormalizedMatch(sanitized: string, m: RegExpMatchArray): NormalizedNumber | null {
  const base = Number((m[1] ?? "").replaceAll(",", ""));
  if (!Number.isFinite(base)) return null;
  const unitRaw = (m[2] ?? "").toLowerCase();
  if (!unitRaw && Number.isInteger(base) && base >= 1990 && base <= 2040) return null;
  const concept = inferNearbyConcept(sanitized, m.index ?? 0);
  const raw = m[0].trim();
  if (unitRaw === "%" || unitRaw === "pct") return { raw, value: base, kind: "pct", concept };
  if (unitRaw === "bps") return { raw, value: base / 100, kind: "pct", concept };
  return { raw, value: base * (UNIT_MULTIPLIER[unitRaw] ?? 1), kind: "scalar", concept };
}

/** Extracts numbers with unit normalization ($12.5B -> 12.5e9, 68.5% -> 68.5, 50bps -> 0.5%). */
export function extractNormalizedNumbers(text: string): NormalizedNumber[] {
  const sanitized = text.replace(SEC_FORM_TOKEN_RE, " ");
  const out: NormalizedNumber[] = [];
  const re =
    /(?<![a-zA-Z0-9])[$€£¥]?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|pct|bps|billion|million|trillion|bn|mn|亿|[TBMK](?![a-zA-Z]))?/gi;
  for (const m of sanitized.matchAll(re)) {
    const parsed = toNormalizedMatch(sanitized, m);
    if (parsed) out.push(parsed);
  }
  return out;
}

function conceptCompatible(target: string | null, cand: string | null): boolean {
  if (!target || !cand) return true;
  return target === cand;
}

function isWithinTolerance(target: NormalizedNumber, cand: NormalizedNumber): boolean {
  const absDiff = Math.abs(target.value - cand.value);
  if (target.kind === "pct") return absDiff <= 0.25;
  return absDiff / Math.max(Math.abs(target.value), Math.abs(cand.value), 1) <= 0.02;
}

function numberMatchesPool(target: NormalizedNumber, pool: readonly NormalizedNumber[]): boolean {
  const hasTagged =
    target.concept !== null &&
    pool.some((c) => c.kind === target.kind && c.concept === target.concept);
  return pool.some(
    (cand) =>
      target.kind === cand.kind &&
      (!hasTagged || cand.concept === target.concept) &&
      conceptCompatible(target.concept, cand.concept) &&
      isWithinTolerance(target, cand),
  );
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
    } else {
      citedPool.push(...extractNormalizedNumbers(chunkText));
    }
  }
  for (const num of extractNormalizedNumbers(claim.text)) {
    if (!numberMatchesPool(num, citedPool)) {
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
 * Sentence-level grounding & concept-bound numeric consistency verifier for AI IC outputs.
 * Strips SEC form identifiers (10-K/8-K/20-F), converts bps, and rejects cross-concept mismatches.
 */
export function verifyGroundedClaims(params: {
  claims: readonly GroundedClaimInput[];
  knownFactValues: readonly number[];
  knownFactPcts?: readonly number[];
  knownConceptFacts?: readonly ConceptFactValue[];
  chunkMap: ReadonlyMap<string, string>;
}): GroundingVerificationReport {
  const knownNumbers: NormalizedNumber[] = [
    ...(params.knownConceptFacts ?? [])
      .filter((f) => Number.isFinite(f.value))
      .map((f) => ({ raw: String(f.value), value: f.value, kind: f.kind, concept: f.concept })),
    ...params.knownFactValues
      .filter((v) => Number.isFinite(v))
      .map((v) => ({ raw: String(v), value: v, kind: "scalar" as const, concept: null })),
    ...(params.knownFactPcts ?? [])
      .filter((v) => Number.isFinite(v))
      .map((v) => ({ raw: `${v}%`, value: v, kind: "pct" as const, concept: null })),
  ];
  const results = params.claims.map((c) => verifySingleClaim(c, knownNumbers, params.chunkMap));
  const verifiedClaims = results.filter((r) => r.status === "verified").length;
  const totalClaims = results.length;
  return {
    totalClaims,
    verifiedClaims,
    unverifiedClaims: totalClaims - verifiedClaims,
    groundingRatePct: totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 100) : 100,
    results,
  };
}
