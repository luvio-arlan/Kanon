import type { GuidanceDraft } from "@kanon/core";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function numberAppearsInQuote(val: number, quote: string): boolean {
  const scaledCandidates = [val, val / 1e9, val / 1e6, val / 1e3];
  const digitsInQuote = [...quote.matchAll(/-?\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) =>
    Number((m[0] ?? "").replaceAll(",", "")),
  );
  return scaledCandidates.some((cand) =>
    digitsInQuote.some((qNum) => Math.abs(qNum - cand) <= Math.max(0.05, Math.abs(cand) * 0.01)),
  );
}

function unitConsistentWithQuote(unit: GuidanceDraft["unit"], quote: string): boolean {
  if (!unit) return true;
  if (unit === "pct") return /%|percent|百分点|毛利率|利润率/i.test(quote);
  if (unit === "usd_per_share") return /\$|eps|per\s+share|每股/i.test(quote);
  return /\$|usd|billion|million|b\b|m\b|亿|美元/i.test(quote);
}

/** Deterministic anchor check: quote must be a verbatim substring of source and match draft bounds/units (R3). */
export function verifyGuidanceQuoteAnchor(
  sourceText: string,
  draft: GuidanceDraft,
): { ok: true } | { ok: false; reason: string } {
  const normSrc = normalizeWhitespace(sourceText);
  const normQuote = normalizeWhitespace(draft.quote);
  if (normQuote.length < 12) return { ok: false, reason: "quote_too_short" };
  if (!normSrc.includes(normQuote)) return { ok: false, reason: "quote_not_substring" };
  if (
    draft.low !== null &&
    draft.low !== undefined &&
    !numberAppearsInQuote(draft.low, normQuote)
  ) {
    return { ok: false, reason: "low_not_in_quote" };
  }
  if (
    draft.high !== null &&
    draft.high !== undefined &&
    !numberAppearsInQuote(draft.high, normQuote)
  ) {
    return { ok: false, reason: "high_not_in_quote" };
  }
  if (!unitConsistentWithQuote(draft.unit, normQuote)) {
    return { ok: false, reason: "unit_mismatch" };
  }
  return { ok: true };
}
