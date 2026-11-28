import { extractSegmentReports, fetchAndExtractPressGuidance } from "@kanon/ai";
import {
  getSecurityByTicker,
  type KanonDb,
  listPeriodicFilingsBySecurity,
  selectPrimaryPeriodicFiling,
  upsertFilingChunks,
  upsertGuidanceCandidates,
  upsertSegmentReportWithLines,
} from "@kanon/core/db";
import { withSystemDb } from "../../../_lib/db-context";

type SystemSyncReason = "cron_tick" | "user_triggered_sync";
type FilingMeta = {
  accession: string;
  form: string;
  filedAt: string;
  periodEnd: string | null;
  fiscalPeriod: string | null;
};

const runSystemSyncDb = <T>(reason: SystemSyncReason, fn: (tx: KanonDb) => Promise<T>) =>
  reason === "cron_tick" ? withSystemDb("cron_tick", fn) : withSystemDb("user_triggered_sync", fn);

function buildFallbackSegmentRow(
  base: {
    securityId: string;
    accession: string;
    form: string;
    fiscalPeriod: string | null;
    periodKind: "annual" | "quarter";
    filedAt: string;
  },
  sec: { currency: string },
  filing: FilingMeta,
  status: Awaited<ReturnType<typeof extractSegmentReports>>["status"],
) {
  const periodEnd = filing.periodEnd ?? filing.filedAt;
  return {
    ...base,
    id: `${filing.accession}:business:${periodEnd}`,
    axis: "business" as const,
    axisQname: "us-gaap:StatementBusinessSegmentsAxis",
    periodStart: periodEnd,
    periodEnd,
    currency: sec.currency ?? "USD",
    revenueConcept: "us-gaap:Revenues",
    profitConcept: null,
    profitIsStandard: false,
    profitReconciled: false,
    consolidatedRevenue: null,
    segmentRevenueSum: null,
    diffPct: null,
    status: status === "ok" ? ("no_dimensional_data" as const) : status,
  };
}

async function persistExtractedSegments(
  tx: KanonDb,
  sec: { id: string; currency: string },
  filing: FilingMeta,
  extracted: Awaited<ReturnType<typeof extractSegmentReports>>,
) {
  const periodKind = filing.form.toUpperCase().startsWith("10-Q")
    ? ("quarter" as const)
    : ("annual" as const);
  const base = {
    securityId: sec.id,
    accession: filing.accession,
    form: filing.form,
    fiscalPeriod: filing.fiscalPeriod,
    periodKind,
    filedAt: filing.filedAt,
  };
  if (extracted.reports.length === 0) {
    await upsertSegmentReportWithLines(
      tx,
      buildFallbackSegmentRow(base, sec, filing, extracted.status),
      [],
    );
    return;
  }
  for (const rep of extracted.reports) {
    await upsertSegmentReportWithLines(
      tx,
      { ...base, ...rep, id: `${filing.accession}:${rep.axis}:${rep.periodEnd}` },
      rep.lines,
    );
  }
}

/** Runs R2 XBRL dimensional segment extraction strictly from periodic filings (U0-3 / U0-7). */
export async function runSyncSegmentsJob(
  payload: Record<string, unknown>,
  reason: SystemSyncReason = "cron_tick",
  signal?: AbortSignal,
): Promise<boolean> {
  const ticker = String(payload.ticker ?? "")
    .trim()
    .toUpperCase();
  const targetAcc = String(payload.accession ?? "").trim();
  if (!ticker) return false;
  const loaded = await runSystemSyncDb(reason, async (tx) => {
    const sec = await getSecurityByTicker(tx, ticker);
    if (!sec?.cik) return null;
    const filings = await listPeriodicFilingsBySecurity(tx, sec.id, {
      forms: targetAcc ? undefined : ["10-K", "10-K/A", "20-F", "20-F/A"],
      limit: 20,
    });
    const filing = selectPrimaryPeriodicFiling(filings, targetAcc || null);
    return filing ? { sec, cik: sec.cik, filing } : null;
  });
  if (!loaded) return false;
  const extracted = await extractSegmentReports({
    cik: loaded.cik,
    accession: loaded.filing.accession,
    form: loaded.filing.form,
    signal,
  });
  await runSystemSyncDb(reason, (tx) =>
    persistExtractedSegments(tx, loaded.sec, loaded.filing, extracted),
  );
  return true;
}

async function persistPressGuidanceOutput(
  tx: KanonDb,
  params: {
    securityId: string;
    ticker: string;
    accession: string;
    extracted: Awaited<ReturnType<typeof fetchAndExtractPressGuidance>>;
  },
) {
  await upsertFilingChunks(
    tx,
    params.extracted.chunks.map((c) => ({
      id: c.id,
      accession: params.accession,
      ticker: params.ticker,
      sectionCode: "ex99_1",
      paraIndex: c.paraIndex,
      text: c.text,
      extractVersion: "press/1",
    })),
  );
  if (params.extracted.candidates.length === 0) return;
  await upsertGuidanceCandidates(
    tx,
    params.extracted.candidates.map((c) => ({
      securityId: params.securityId,
      accession: params.accession,
      chunkId: c.chunkId,
      metric: c.metric,
      basis: c.basis,
      unit: c.unit,
      currency: c.currency,
      targetFiscalYear: c.targetFiscalYear,
      targetFiscalPeriod: c.targetFiscalPeriod,
      low: c.low,
      high: c.high,
      quote: c.quote,
      extractor: c.extractor,
      issuedOn: c.issuedOn,
    })),
  );
}

/** Runs R3b 8-K Ex-99.1 press release guidance candidate extraction in 3 phases (U1-2 / G10). */
export async function runExtractPressGuidanceJob(
  payload: Record<string, unknown>,
  reason: SystemSyncReason = "cron_tick",
  signal?: AbortSignal,
): Promise<boolean> {
  const ticker = String(payload.ticker ?? "")
    .trim()
    .toUpperCase();
  const accession = String(payload.accession ?? "").trim();
  const issuedOn = String(payload.issuedOn ?? "").trim() || new Date().toISOString().slice(0, 10);
  if (!ticker || !accession) return false;
  const sec = await runSystemSyncDb(reason, (tx) => getSecurityByTicker(tx, ticker));
  const cik = String(payload.cik ?? sec?.cik ?? "").trim();
  if (!sec || !cik) return false;
  const extracted = await fetchAndExtractPressGuidance({ cik, accession, issuedOn, signal });
  if (extracted.chunks.length === 0) return false;
  await runSystemSyncDb(reason, (tx) =>
    persistPressGuidanceOutput(tx, { securityId: sec.id, ticker, accession, extracted }),
  );
  return true;
}
