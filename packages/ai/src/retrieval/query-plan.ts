import { expandLexiconTerms } from "./fin-lexicon";

export interface PlannedPeriodRef {
  fiscalYear: number | null;
  fiscalPeriod: "FY" | "Q1" | "Q2" | "Q3" | "Q4" | null;
}

export interface BilingualQueryPlan {
  englishTerms: string[];
  concepts: string[];
  periods: PlannedPeriodRef[];
  tsQuery: string;
}

const STOP_EN = new Set([
  "what",
  "was",
  "were",
  "the",
  "for",
  "and",
  "from",
  "with",
  "does",
  "did",
  "how",
  "why",
  "who",
  "when",
  "are",
  "this",
  "that",
]);

const CN_Q: Record<string, "Q1" | "Q2" | "Q3" | "Q4"> = {
  "1": "Q1",
  "2": "Q2",
  "3": "Q3",
  "4": "Q4",
  一: "Q1",
  二: "Q2",
  三: "Q3",
  四: "Q4",
};

const PERIOD_PATTERNS = [
  /\bFY\s*(\d{2,4})(?:\s*(Q[1-4]))?\b/gi,
  /(\d{4})\s*财年(?:\s*第?([1-4一二三四])季度)?/gi,
  /\b(20\d{2})\s*年?(?:\s*第?([1-4一二三四])季度)?/gi,
];

function resolveFiscalPeriod(rawQ: string | undefined): PlannedPeriodRef["fiscalPeriod"] {
  if (!rawQ) return "FY";
  const up = rawQ.toUpperCase();
  if (up === "Q1" || up === "Q2" || up === "Q3" || up === "Q4") return up;
  return CN_Q[up] ?? null;
}

function collectPatternPeriods(
  question: string,
  re: RegExp,
  seen: Set<string>,
  out: PlannedPeriodRef[],
) {
  for (const m of question.matchAll(re)) {
    const yrRaw = Number(m[1]);
    if (!Number.isFinite(yrRaw)) continue;
    const fiscalYear = yrRaw < 100 ? 2000 + yrRaw : yrRaw;
    const fiscalPeriod = resolveFiscalPeriod(m[2]);
    const key = `${fiscalYear}:${fiscalPeriod}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ fiscalYear, fiscalPeriod });
    }
  }
}

function extractPeriods(question: string): PlannedPeriodRef[] {
  const out: PlannedPeriodRef[] = [];
  const seen = new Set<string>();
  for (const re of PERIOD_PATTERNS) collectPatternPeriods(question, re, seen, out);
  return out;
}

function sanitizeTsTerm(term: string): string {
  const trimmed = term.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    const inner = trimmed
      .slice(1, -1)
      .replace(/[^a-z0-9\s-]/gi, "")
      .trim();
    return inner ? `"${inner}"` : "";
  }
  return trimmed.replace(/[^a-z0-9-]/gi, "").trim();
}

/** Plans a bilingual financial query into English terms, XBRL concepts, fiscal periods, and Postgres `websearch_to_tsquery` string (R4). */
export function planBilingualQuery(question: string): BilingualQueryPlan {
  const { englishTerms, concepts } = expandLexiconTerms(question);
  const periods = extractPeriods(question);
  const cleaned = englishTerms
    .map(sanitizeTsTerm)
    .filter((t) => {
      const bare = t.replaceAll('"', "");
      return bare.length >= 2 && !STOP_EN.has(bare.toLowerCase());
    })
    .slice(0, 14);
  return {
    englishTerms: cleaned.map((t) => t.replaceAll('"', "")),
    concepts,
    periods,
    tsQuery: cleaned.join(" OR "),
  };
}
