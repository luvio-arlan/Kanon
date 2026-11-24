export interface SecFactUnit {
  val?: number;
  form?: string;
  fy?: number;
  fp?: string;
  start?: string;
  end?: string;
  frame?: string;
}

export type XbrlFactsNamespace = Record<
  string,
  { units?: { USD?: SecFactUnit[]; "USD/shares"?: SecFactUnit[]; shares?: SecFactUnit[] } }
>;

export interface SecFactsPayload {
  "us-gaap"?: XbrlFactsNamespace;
  "ifrs-full"?: XbrlFactsNamespace;
}

export type UnitKey = "USD" | "USD/shares" | "shares";

export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function diffDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.round((e - s) / 86_400_000);
}

function isValidAnnualRow(
  row: SecFactUnit,
  kind: "flow" | "instant",
): row is { val: number; fy: number; end?: string; frame?: string } {
  const annualForm = row.form === "10-K" || row.form === "20-F";
  if (!annualForm || typeof row.val !== "number" || typeof row.fy !== "number") return false;
  if (kind === "instant") {
    return !row.start || (diffDays(row.start, row.end) ?? 0) <= 5;
  }
  if (row.frame && /^CY\d{4}$/.test(row.frame)) return true;
  const days = diffDays(row.start, row.end);
  if (days !== null) return days >= 320 && days <= 395;
  return !row.fp || row.fp === "FY";
}

function indexAnnualRows(
  list: readonly SecFactUnit[],
  kind: "flow" | "instant",
): Map<number, number> {
  const byYear = new Map<number, { end: string; hasFrame: boolean; val: number }>();
  for (const row of list) {
    if (!isValidAnnualRow(row, kind)) continue;
    const end = row.end ?? "";
    const hasFrame = Boolean(row.frame && /^CY\d{4}$/.test(row.frame));
    const prev = byYear.get(row.fy);
    const better =
      !prev || (hasFrame && !prev.hasFrame) || (hasFrame === prev.hasFrame && end > prev.end);
    if (better) byYear.set(row.fy, { end, hasFrame, val: row.val });
  }
  return new Map([...byYear.entries()].map(([fy, v]) => [fy, v.val]));
}

function collectFromNamespace(
  ns: XbrlFactsNamespace | undefined,
  tags: readonly string[],
  unitKey: UnitKey,
  kind: "flow" | "instant",
): Map<number, number> {
  if (!ns) return new Map();
  for (const tag of tags) {
    const list = ns[tag]?.units?.[unitKey];
    if (!list) continue;
    const map = indexAnnualRows(list, kind);
    if (map.size > 0) return map;
  }
  return new Map();
}

export function collectAnnualMap(
  facts: SecFactsPayload | undefined,
  usTags: readonly string[],
  ifrsTags: readonly string[] = [],
  unitKey: UnitKey = "USD",
  kind: "flow" | "instant" = "flow",
): Map<number, number> {
  const usMap = collectFromNamespace(facts?.["us-gaap"], usTags, unitKey, kind);
  if (usMap.size > 0) return usMap;
  return collectFromNamespace(facts?.["ifrs-full"], ifrsTags, unitKey, kind);
}
