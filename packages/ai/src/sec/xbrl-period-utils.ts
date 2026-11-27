import { z } from "zod";

export const SecTickerTableSchema = z.record(
  z.string(),
  z.object({
    ticker: z.string().optional(),
    cik_str: z.union([z.number(), z.string()]).optional(),
  }),
);
export const SecSubmissionsSchema = z.object({
  name: z.string().optional(),
  filings: z
    .object({
      recent: z
        .object({
          form: z.array(z.string()).optional(),
          filingDate: z.array(z.string()).optional(),
          reportDate: z.array(z.string()).optional(),
          accessionNumber: z.array(z.string()).optional(),
          primaryDocument: z.array(z.string()).optional(),
          primaryDocDescription: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});
export type SecSubmissionsResponse = z.infer<typeof SecSubmissionsSchema>;

const SecFactUnitSchema = z.object({
  accn: z.string().optional(),
  val: z.number().optional(),
  form: z.string().optional(),
  fy: z.number().optional(),
  fp: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  filed: z.string().optional(),
  frame: z.string().optional(),
});
const SecNamespaceSchema = z.record(
  z.string(),
  z.object({ units: z.record(z.string(), z.array(SecFactUnitSchema).optional()).optional() }),
);
export const SecCompanyFactsSchema = z.object({
  facts: z
    .object({
      "us-gaap": SecNamespaceSchema.optional(),
      "ifrs-full": SecNamespaceSchema.optional(),
    })
    .optional(),
});

export interface SecFactUnit {
  accn?: string;
  val?: number;
  form?: string;
  fy?: number;
  fp?: string;
  start?: string;
  end?: string;
  filed?: string;
  frame?: string;
}

export const QUARTER_FRAME_RE = /^CY(\d{4})Q([1-4])$/;
export const VALID_Q_FORMS = new Set(["10-Q", "10-K", "6-K", "20-F"]);

export const KNOWN_CIK_MAP: Record<string, string> = {
  MU: "0000723125",
  NVDA: "0001045810",
  TSM: "0001046179",
  AAPL: "0000320193",
  MSFT: "0000789019",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  META: "0001326801",
  AVGO: "0001730168",
  AMD: "0000002488",
  ASML: "0000937966",
  TSLA: "0001318605",
  COST: "0000909832",
};

export function diffDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  return Math.round((e - s) / 86_400_000);
}

export function isValidAnnualRow(
  row: SecFactUnit,
  kind: "flow" | "instant",
): row is { val: number; fy: number; end?: string; filed?: string; frame?: string } {
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

export function resolvePeriodYear(row: { fy: number; end?: string; frame?: string }): number {
  const frameMatch = row.frame ? /^CY(\d{4})(?:Q4I)?$/.exec(row.frame) : null;
  if (frameMatch?.[1]) return Number(frameMatch[1]);
  if (row.end && /^\d{4}-\d{2}-\d{2}/.test(row.end)) {
    const yr = Number(row.end.slice(0, 4));
    const mo = Number(row.end.slice(5, 7));
    const day = Number(row.end.slice(8, 10));
    return mo === 1 || (mo === 2 && day <= 7) ? yr - 1 : yr;
  }
  return row.fy;
}

export function parseQuarterLabel(row: SecFactUnit): string | null {
  const m = row.frame ? QUARTER_FRAME_RE.exec(row.frame) : null;
  if (m?.[1] && m[2]) return `${m[1]} Q${m[2]}`;
  if (!row.end) return null;
  const month = Number(row.end.slice(5, 7));
  if (!Number.isFinite(month)) return null;
  return `${row.end.slice(0, 4)} Q${month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4}`;
}

export function classifyDuration(row: SecFactUnit): "q1" | "m6" | "m9" | null {
  const days = diffDays(row.start, row.end);
  if (days === null) return null;
  if (days >= 70 && days <= 115) return "q1";
  if (days >= 160 && days <= 205) return "m6";
  return days >= 250 && days <= 295 ? "m9" : null;
}

export function shiftQuarterLabel(label: string, delta: number): string | null {
  const m = /^(\d{4})\s+Q([1-4])$/.exec(label);
  if (!m?.[1] || !m[2]) return null;
  const total = Number(m[1]) * 4 + (Number(m[2]) - 1) + delta;
  return `${Math.floor(total / 4)} Q${(((total % 4) + 4) % 4) + 1}`;
}

export function addThreeMonthsClamped(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1 + 3;
  const targetYear = year + Math.floor(monthIdx / 12);
  const targetMonth = monthIdx % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), lastDay);
  return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10);
}

export function isBetterFiling(
  prev: { filed: string; endDate: string },
  next: { filed: string; endDate: string },
): boolean {
  if (next.filed && prev.filed) {
    return next.filed > prev.filed || (next.filed === prev.filed && next.endDate > prev.endDate);
  }
  return next.endDate > prev.endDate;
}

export interface QuarterPoint {
  periodLabel: string;
  endDate: string;
  val: number;
  filed: string;
}

export interface YtdBucket {
  endDate: string;
  val: number;
  filed: string;
}

export function upsertYtd(map: Map<string, YtdBucket>, label: string, next: YtdBucket) {
  const prev = map.get(label);
  if (!prev || isBetterFiling(prev, next)) map.set(label, next);
}

export function upsertStandalone(map: Map<string, QuarterPoint>, next: QuarterPoint) {
  const prev = map.get(next.periodLabel);
  if (!prev || isBetterFiling(prev, next)) map.set(next.periodLabel, next);
}

export function decumulateYtd(
  standalone: Map<string, QuarterPoint>,
  ytd6: Map<string, YtdBucket>,
  ytd9: Map<string, YtdBucket>,
): Map<string, QuarterPoint> {
  const out = new Map(standalone);
  for (const [label, b6] of ytd6.entries()) {
    const q1 = out.has(label) ? undefined : out.get(shiftQuarterLabel(label, -1) ?? "");
    if (q1) {
      out.set(label, {
        periodLabel: label,
        endDate: b6.endDate,
        val: b6.val - q1.val,
        filed: b6.filed,
      });
    }
  }
  for (const [label, b9] of ytd9.entries()) {
    const b6 = out.has(label) ? undefined : ytd6.get(shiftQuarterLabel(label, -1) ?? "");
    if (b6) {
      out.set(label, {
        periodLabel: label,
        endDate: b9.endDate,
        val: b9.val - b6.val,
        filed: b9.filed,
      });
    }
  }
  return out;
}
