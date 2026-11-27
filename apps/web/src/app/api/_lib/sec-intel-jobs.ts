import {
  buildFilingRedline,
  type ComparableFilingCandidate,
  extractSegmentReports,
  fetchSecWithRetry,
  findComparablePriorFiling,
} from "@kanon/ai";
import type { RedlineSection } from "@kanon/core";
import {
  getSecurityByTicker,
  type KanonDb,
  listFilingsBySecurity,
  upsertFilingRedline,
  upsertSectionChunks,
  upsertSegmentReportWithLines,
} from "@kanon/core/db";
import { withSystemDb } from "./db-context";

type SystemSyncReason = "cron_tick" | "user_triggered_sync";
const REDLINE_SECTIONS: readonly RedlineSection[] = ["risk_factors", "mda"];

function runSystemSyncDb<T>(reason: SystemSyncReason, fn: (tx: KanonDb) => Promise<T>): Promise<T> {
  return reason === "cron_tick"
    ? withSystemDb("cron_tick", fn)
    : withSystemDb("user_triggered_sync", fn);
}

async function fetchHtmlMap(
  target: ComparableFilingCandidate,
  pairs: ReadonlyArray<{ prev: ComparableFilingCandidate }>,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const htmlCache = new Map<string, string>();
  const urls = new Map<string, string>([[target.accession, target.primaryDocUrl]]);
  for (const p of pairs) urls.set(p.prev.accession, p.prev.primaryDocUrl);
  for (const [acc, url] of urls) {
    const res = await fetchSecWithRetry(url, { timeoutMs: 12_000, maxRetries: 2, signal });
    if (!res.ok) throw new Error(`SEC filing HTTP ${res.status}`);
    htmlCache.set(acc, await res.text());
  }
  return htmlCache;
}

async function persistRedlineOutputs(
  tx: KanonDb,
  ticker: string,
  targetAccession: string,
  outputs: ReadonlyArray<{
    section: RedlineSection;
    prevAccession: string;
    built: ReturnType<typeof buildFilingRedline>;
  }>,
) {
  for (const item of outputs) {
    const { response, currentChunks, previousChunks } = item.built;
    const allChunks = [
      ...currentChunks.map((c) => ({
        ...c,
        accession: targetAccession,
        ticker,
        sectionCode: item.section,
      })),
      ...previousChunks.map((c) => ({
        ...c,
        accession: item.prevAccession,
        ticker,
        sectionCode: item.section,
      })),
    ];
    if (allChunks.length > 0) await upsertSectionChunks(tx, allChunks);
    const dbStatus =
      response.status === "ready" ||
      response.status === "section_missing" ||
      response.status === "too_large"
        ? response.status
        : "failed";
    await upsertFilingRedline(tx, {
      currentAccession: targetAccession,
      previousAccession: item.prevAccession,
      sectionCode: item.section,
      algoVersion: "redline/1",
      status: dbStatus,
      stats: response.stats,
      changes: response.changes,
    });
  }
}

/** Runs R1 cross-period redline extraction and persists full-section chunks + redline diff. */
export async function runBuildRedlineJob(
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
    return sec ? { sec, filings: await listFilingsBySecurity(tx, sec.id, 24) } : null;
  });
  const target =
    (targetAcc ? loaded?.filings.find((f) => f.accession === targetAcc) : null) ??
    loaded?.filings.find((f) => /^(?:10-K|10-Q|20-F)/i.test(f.form));
  if (!loaded || !target) return false;
  const secParam = payload.section;
  const sections: readonly RedlineSection[] =
    secParam === "risk_factors" || secParam === "mda" ? [secParam] : REDLINE_SECTIONS;
  const pairs = sections
    .map((section) => ({
      section,
      prev: findComparablePriorFiling({ target, filings: loaded.filings, section }),
    }))
    .filter(
      (p): p is { section: RedlineSection; prev: ComparableFilingCandidate } => p.prev !== null,
    );
  if (pairs.length === 0) return false;
  const htmlCache = await fetchHtmlMap(target, pairs, signal);
  const currentHtml = htmlCache.get(target.accession) ?? "";
  const outputs = pairs.map((p) => ({
    section: p.section,
    prevAccession: p.prev.accession,
    built: buildFilingRedline({
      ticker,
      section: p.section,
      current: target,
      previous: p.prev,
      currentHtml,
      previousHtml: htmlCache.get(p.prev.accession) ?? "",
    }),
  }));
  await runSystemSyncDb(reason, (tx) =>
    persistRedlineOutputs(tx, ticker, target.accession, outputs),
  );
  return true;
}

function buildNoSegmentFallbackInput(
  sec: { id: string; currency: string },
  filing: {
    accession: string;
    form: string;
    filedAt: string;
    periodEnd: string | null;
    fiscalPeriod: string | null;
  },
  status: Awaited<ReturnType<typeof extractSegmentReports>>["status"],
) {
  const periodEnd = filing.periodEnd ?? filing.filedAt;
  return {
    id: `${filing.accession}:business:${periodEnd}`,
    securityId: sec.id,
    accession: filing.accession,
    form: filing.form,
    axis: "business" as const,
    axisQname: "us-gaap:StatementBusinessSegmentsAxis",
    periodStart: periodEnd,
    periodEnd,
    fiscalPeriod: filing.fiscalPeriod,
    currency: sec.currency ?? "USD",
    revenueConcept: "us-gaap:Revenues",
    profitConcept: null,
    profitIsStandard: false,
    consolidatedRevenue: null,
    segmentRevenueSum: null,
    diffPct: null,
    status: status === "ok" ? ("no_dimensional_data" as const) : status,
    filedAt: filing.filedAt,
  };
}

async function persistExtractedSegments(
  tx: KanonDb,
  sec: { id: string; currency: string },
  filing: {
    accession: string;
    form: string;
    filedAt: string;
    periodEnd: string | null;
    fiscalPeriod: string | null;
  },
  extracted: Awaited<ReturnType<typeof extractSegmentReports>>,
) {
  if (extracted.reports.length === 0) {
    await upsertSegmentReportWithLines(
      tx,
      buildNoSegmentFallbackInput(sec, filing, extracted.status),
      [],
    );
    return;
  }
  const base = {
    securityId: sec.id,
    accession: filing.accession,
    form: filing.form,
    fiscalPeriod: filing.fiscalPeriod,
    filedAt: filing.filedAt,
  };
  for (const rep of extracted.reports) {
    await upsertSegmentReportWithLines(
      tx,
      { ...base, ...rep, id: `${filing.accession}:${rep.axis}:${rep.periodEnd}` },
      rep.lines,
    );
  }
}

/** Runs R2 XBRL dimensional segment extraction and persists reconciled reports & lines. */
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
    const filings = await listFilingsBySecurity(tx, sec.id, 16);
    const filing =
      (targetAcc ? filings.find((f) => f.accession === targetAcc) : null) ??
      filings.find((f) => /^(?:10-K|20-F|10-Q)$/i.test(f.form));
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
