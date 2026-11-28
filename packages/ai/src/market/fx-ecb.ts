import type { CurrencyCode } from "@kanon/core";

export interface EcbFxRateRow {
  currency: CurrencyCode;
  rateDate: string;
  usdPerUnit: number;
  source: "ecb";
  sourceLicense: "ecb_reference";
}

const ECB_SERIES_URL =
  "https://data-api.ecb.europa.eu/service/data/EXR/D.USD+HKD+CNY+GBP+JPY.EUR.SP00.A?format=csvdata";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Builds the ECB SDMX CSV URL: bounded `startPeriod`/`endPeriod` history backfill, else the latest 15 observations. */
export function buildEcbFxUrl(range?: { startPeriod?: string; endPeriod?: string }): string {
  const start = range?.startPeriod;
  if (!start || !ISO_DATE_RE.test(start)) return `${ECB_SERIES_URL}&lastNObservations=15`;
  const end =
    range?.endPeriod && ISO_DATE_RE.test(range.endPeriod) ? `&endPeriod=${range.endPeriod}` : "";
  return `${ECB_SERIES_URL}&startPeriod=${start}${end}`;
}

const SUPPORTED_ECB_CODES = new Set(["USD", "HKD", "CNY", "GBP", "JPY"]);

/** Non-USD account/trade currencies resolvable from ECB reference rates (EUR is the ECB base). */
export const ECB_FX_CURRENCIES = ["EUR", "HKD", "CNY", "GBP", "JPY"] as const;

function parseSingleEcbLine(
  line: string,
  idx: { cur: number; date: number; val: number },
): { cur: string; date: string; val: number } | null {
  const cols = line.split(",");
  const cur = (cols[idx.cur] ?? "").trim().replace(/^"|"$/g, "").toUpperCase();
  const date = (cols[idx.date] ?? "").trim().replace(/^"|"$/g, "");
  const val = Number((cols[idx.val] ?? "").trim().replace(/^"|"$/g, ""));
  if (!SUPPORTED_ECB_CODES.has(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(val) || val <= 0) return null;
  return { cur, date, val };
}

function parseEcbCsvRows(csv: string): Map<string, Map<string, number>> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();
  const header = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = {
    cur: header.indexOf("CURRENCY"),
    date: header.indexOf("TIME_PERIOD"),
    val: header.indexOf("OBS_VALUE"),
  };
  if (idx.cur < 0 || idx.date < 0 || idx.val < 0) return new Map();

  const byDate = new Map<string, Map<string, number>>();
  for (let i = 1; i < lines.length; i += 1) {
    const parsed = parseSingleEcbLine(lines[i] ?? "", idx);
    if (!parsed) continue;
    const map = byDate.get(parsed.date) ?? new Map<string, number>();
    map.set(parsed.cur, parsed.val);
    byDate.set(parsed.date, map);
  }
  return byDate;
}

/** Converts ECB EUR-based reference rates (`C per EUR`) into `usdPerUnit` for USD/EUR/HKD/CNY/GBP/JPY. */
export function convertEcbCsvToUsdPerUnit(csv: string): EcbFxRateRow[] {
  const byDate = parseEcbCsvRows(csv);
  const out: EcbFxRateRow[] = [];
  for (const [rateDate, perEur] of byDate) {
    const usdPerEur = perEur.get("USD");
    if (!usdPerEur || usdPerEur <= 0) continue;
    out.push({
      currency: "USD",
      rateDate,
      usdPerUnit: 1,
      source: "ecb",
      sourceLicense: "ecb_reference",
    });
    out.push({
      currency: "EUR",
      rateDate,
      usdPerUnit: usdPerEur,
      source: "ecb",
      sourceLicense: "ecb_reference",
    });
    for (const code of ["HKD", "CNY", "GBP", "JPY"] as const) {
      const cPerEur = perEur.get(code);
      if (!cPerEur || cPerEur <= 0) continue;
      out.push({
        currency: code,
        rateDate,
        usdPerUnit: usdPerEur / cPerEur,
        source: "ecb",
        sourceLicense: "ecb_reference",
      });
    }
  }
  return out;
}

/**
 * Fetches ECB reference FX rates (independent of the SEC gateway). With `startPeriod` it backfills the
 * full bounded history (V0-2); without it, only the latest 15 observations for the daily cron.
 */
export async function fetchEcbReferenceFxRates(options?: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
  startPeriod?: string;
  endPeriod?: string;
}): Promise<EcbFxRateRow[]> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(
    options?.timeoutMs ?? (options?.startPeriod ? 15_000 : 10_000),
  );
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const res = await fetchImpl(buildEcbFxUrl(options), {
    headers: { Accept: "text/csv, text/plain" },
    signal,
  });
  if (!res.ok) throw new Error(`ECB FX request failed: HTTP ${res.status}`);
  const csv = await res.text();
  return convertEcbCsvToUsdPerUnit(csv);
}
