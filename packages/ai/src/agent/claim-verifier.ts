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

interface NormalizedNumber {
  raw: string;
  value: number;
  kind: "pct" | "scalar";
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

/** Extracts numbers with unit normalization ($12.5B -> 12.5e9, 68.5% -> 68.5). */
export function extractNormalizedNumbers(text: string): NormalizedNumber[] {
  const out: NormalizedNumber[] = [];
  const re =
    /(?<![a-zA-Z0-9])[$€£¥]?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|pct|bps|billion|million|trillion|bn|mn|亿|[TBMK](?![a-zA-Z]))?/gi;
  for (const m of text.matchAll(re)) {
    const numStr = (m[1] ?? "").replaceAll(",", "");
    const base = Number(numStr);
    if (!Number.isFinite(base)) continue;
    // Ignore pure calendar years like 2024, 2025, 2026
    const unitRaw = (m[2] ?? "").toLowerCase();
    if (!unitRaw && Number.isInteger(base) && base >= 1990 && base <= 2040) continue;
    if (unitRaw === "%" || unitRaw === "pct") {
      out.push({ raw: m[0].trim(), value: base, kind: "pct" });
      continue;
    }
    const mult = UNIT_MULTIPLIER[unitRaw] ?? 1;
    out.push({ raw: m[0].trim(), value: base * mult, kind: "scalar" });
  }
  return out;
}

function numberMatchesPool(target: NormalizedNumber, pool: readonly NormalizedNumber[]): boolean {
  for (const cand of pool) {
    if (target.kind !== cand.kind) continue;
    const absDiff = Math.abs(target.value - cand.value);
    if (target.kind === "pct" && absDiff <= 0.25) return true;
    const scale = Math.max(Math.abs(target.value), Math.abs(cand.value), 1);
    if (absDiff / scale <= 0.02) return true;
  }
  return false;
}

function verifySingleClaim(
  claim: GroundedClaimInput,
  knownNumbers: readonly NormalizedNumber[],
  chunkMap: ReadonlyMap<string, string>,
): VerifiedClaimResult {
  const issues: string[] = [];
  if (claim.citations.length === 0) {
    issues.push("缺少证据引用锚点");
  }
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
      issues.push(`数值「${num.raw}」未在引用原文或结构化事实中核验匹配`);
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
 * Sentence-level grounding & numeric consistency verifier for AI IC outputs (W3.2).
 * Flags hallucinated citations or unbacked numbers as `unverified`.
 */
export function verifyGroundedClaims(params: {
  claims: readonly GroundedClaimInput[];
  knownFactValues: readonly number[];
  knownFactPcts?: readonly number[];
  chunkMap: ReadonlyMap<string, string>;
}): GroundingVerificationReport {
  const knownNumbers: NormalizedNumber[] = [
    ...params.knownFactValues
      .filter((v) => Number.isFinite(v))
      .map((v) => ({ raw: String(v), value: v, kind: "scalar" as const })),
    ...(params.knownFactPcts ?? [])
      .filter((v) => Number.isFinite(v))
      .map((v) => ({ raw: `${v}%`, value: v, kind: "pct" as const })),
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
