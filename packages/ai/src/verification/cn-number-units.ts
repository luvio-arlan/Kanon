export interface ParsedNumericToken {
  raw: string;
  value: number;
  kind: "pct" | "scalar";
  index: number;
}

const SEC_FORM_TOKEN_RE =
  /\b(?:10-K\/A|10-Q\/A|20-F\/A|10-K|10-Q|8-K|20-F|6-K|NT\s*10-K|DEF\s*14A|S-1|Form\s+4|Item\s+\d+(?:\.\d+)?)\b/gi;

const PCT_UNITS = new Set(["%", "pct", "百分点", "个百分点"]);
const BPS_UNITS = new Set(["bps", "基点", "个基点"]);

const UNIT_MULTIPLIER: Record<string, number> = {
  t: 1e12,
  trillion: 1e12,
  万亿: 1e12,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  十亿: 1e9,
  亿: 1e8,
  千万: 1e7,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  百万: 1e6,
  十万: 1e5,
  万: 1e4,
  k: 1e3,
};

const NUM_WITH_UNIT_RE =
  /(?<![a-zA-Z0-9])[$€£¥]?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(%|pct|个百分点|百分点|个基点|基点|bps|trillion|billion|million|bn|mn|万亿|十亿|千万|百万|十万|亿|万|[TBMK](?![a-zA-Z]))?/gi;

export function sanitizeFormTokens(text: string): string {
  return text.replace(SEC_FORM_TOKEN_RE, (m) => " ".repeat(m.length));
}

function classifyUnitValue(
  base: number,
  unitRaw: string,
): { value: number; kind: "pct" | "scalar" } {
  if (PCT_UNITS.has(unitRaw)) return { value: base, kind: "pct" };
  if (BPS_UNITS.has(unitRaw)) return { value: base / 100, kind: "pct" };
  return { value: base * (UNIT_MULTIPLIER[unitRaw] ?? 1), kind: "scalar" };
}

/** Extracts English + Chinese numeric tokens (`1.3 万亿` -> 1.3e12, `45 个基点` -> 0.45 pct) (R4). */
export function extractCnAndEnNumbers(text: string): ParsedNumericToken[] {
  const sanitized = sanitizeFormTokens(text);
  const out: ParsedNumericToken[] = [];
  for (const m of sanitized.matchAll(NUM_WITH_UNIT_RE)) {
    const base = Number((m[1] ?? "").replaceAll(",", ""));
    const unitRaw = (m[2] ?? "").toLowerCase();
    const isBareYear = !unitRaw && Number.isInteger(base) && base >= 1990 && base <= 2040;
    if (!Number.isFinite(base) || isBareYear) continue;
    const { value, kind } = classifyUnitValue(base, unitRaw);
    out.push({ raw: m[0].trim(), value, kind, index: m.index ?? 0 });
  }
  return out;
}
