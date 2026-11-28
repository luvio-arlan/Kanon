import type { GuidanceFiscalPeriod } from "@kanon/core";

export interface TargetPeriod {
  year: number;
  period: GuidanceFiscalPeriod;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  nbsp: " ",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  bull: "•",
  plusmn: "±",
};

/** Decodes decimal / hexadecimal numeric references and common named HTML entities in EDGAR exhibits. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const QUARTER_WORDS: Readonly<Record<string, GuidanceFiscalPeriod>> = {
  first: "Q1",
  second: "Q2",
  third: "Q3",
  fourth: "Q4",
};

/** Parses the guided fiscal period (`Q4 FY2027`, `fourth quarter of fiscal 2027`, `fiscal 2027`). */
export function inferTargetPeriod(text: string): TargetPeriod | null {
  const q = text.match(/\b(Q[1-4])\s*(?:FY|fiscal(?:\s+year)?)?\s*['’]?(20\d{2})\b/i);
  if (q?.[1] && q[2]) {
    return { period: q[1].toUpperCase() as GuidanceFiscalPeriod, year: Number(q[2]) };
  }
  const word = text.match(
    /\b(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(?:fiscal(?:\s+year)?\s+)?(20\d{2})\b/i,
  );
  const wordPeriod = word?.[1] ? QUARTER_WORDS[word[1].toLowerCase()] : undefined;
  if (wordPeriod && word?.[2]) return { period: wordPeriod, year: Number(word[2]) };
  const fy = text.match(/\b(?:full[- ]year|fiscal(?:\s+year)?|FY)\s*['’]?(20\d{2})\b/i);
  return fy?.[1] ? { period: "FY", year: Number(fy[1]) } : null;
}

const OUTLOOK_HEADING_RE = /\b(?:outlook|guidance)\b/i;

/**
 * Sticky outlook context: only a line that both announces an outlook/guidance AND names a period may
 * (re)set it. Bullet lines that merely mention "outlook" (NVDA: "…revenue from China in its outlook.")
 * keep the current context instead of erasing it — the V1-1 zero-candidate root cause.
 */
export function nextPeriodContext(prev: TargetPeriod | null, line: string): TargetPeriod | null {
  if (!OUTLOOK_HEADING_RE.test(line)) return prev;
  return inferTargetPeriod(line) ?? prev;
}
