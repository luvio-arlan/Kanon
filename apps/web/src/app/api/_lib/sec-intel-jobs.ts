import {
  buildFilingRedline,
  type ComparableFilingCandidate,
  fetchSecWithRetry,
  findComparablePriorFiling,
  MAX_REDLINE_HTML_BYTES,
  REDLINE_ALGO_VERSION,
  readBoundedTextStream,
  resolvePrimaryDocUrl,
} from "@kanon/ai";
import type { RedlineSection } from "@kanon/core";
import {
  getSecurityByTicker,
  type KanonDb,
  listPeriodicFilingsBySecurity,
  selectPrimaryPeriodicFiling,
  updateFilingPrimaryDocUrl,
  upsertFilingRedline,
  upsertSectionChunks,
} from "@kanon/core/db";
import { runSyncSegmentsJob } from "../internal/jobs/tick/segment-sync-job";
import { withSystemDb } from "./db-context";

export { runSyncSegmentsJob };

type SystemSyncReason = "cron_tick" | "user_triggered_sync";
type FetchedDoc = { status: "ok"; html: string } | { status: "too_large" };
type RedlineOutputItem = {
  section: RedlineSection;
  prevAccession: string;
  tooLarge?: boolean;
  built?: ReturnType<typeof buildFilingRedline>;
};

const REDLINE_SECTIONS: readonly RedlineSection[] = ["risk_factors", "mda"];
const runSystemSyncDb = <T>(reason: SystemSyncReason, fn: (tx: KanonDb) => Promise<T>) =>
  reason === "cron_tick" ? withSystemDb("cron_tick", fn) : withSystemDb("user_triggered_sync", fn);

async function resolveAndFetchHtmlMap(
  cik: string | null,
  target: ComparableFilingCandidate,
  pairs: ReadonlyArray<{ prev: ComparableFilingCandidate }>,
  reason: SystemSyncReason,
  signal?: AbortSignal,
): Promise<Map<string, FetchedDoc>> {
  const htmlCache = new Map<string, FetchedDoc>();
  const urls = new Map<string, string>([[target.accession, target.primaryDocUrl]]);
  for (const p of pairs) urls.set(p.prev.accession, p.prev.primaryDocUrl);
  for (const [acc, rawUrl] of urls) {
    let url = rawUrl;
    if (url.endsWith("/") && cik) {
      const resolved = await resolvePrimaryDocUrl(cik, acc, signal);
      if (resolved) {
        url = resolved;
        await runSystemSyncDb(reason, (tx) => updateFilingPrimaryDocUrl(tx, acc, resolved));
      }
    }
    const res = await fetchSecWithRetry(url, { timeoutMs: 12_000, maxRetries: 2, signal });
    if (!res.ok) throw new Error(`SEC filing HTTP ${res.status}`);
    const bounded = await readBoundedTextStream(res, MAX_REDLINE_HTML_BYTES);
    htmlCache.set(acc, bounded.status === "ok" ? { status: "ok", html: bounded.text } : bounded);
  }
  return htmlCache;
}

async function persistOneRedline(
  tx: KanonDb,
  ticker: string,
  targetAcc: string,
  item: RedlineOutputItem,
) {
  if (item.tooLarge || !item.built) {
    await upsertFilingRedline(tx, {
      currentAccession: targetAcc,
      previousAccession: item.prevAccession,
      sectionCode: item.section,
      algoVersion: REDLINE_ALGO_VERSION,
      status: "too_large",
      stats: null,
      changes: [],
    });
    return;
  }
  const { response, currentChunks, previousChunks } = item.built;
  const allChunks = [
    ...currentChunks.map((c) => ({
      ...c,
      accession: targetAcc,
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
    currentAccession: targetAcc,
    previousAccession: item.prevAccession,
    sectionCode: item.section,
    algoVersion: REDLINE_ALGO_VERSION,
    status: dbStatus,
    stats: response.stats,
    changes: response.changes,
  });
}

function buildRedlineOutputs(
  ticker: string,
  target: ComparableFilingCandidate,
  pairs: ReadonlyArray<{ section: RedlineSection; prev: ComparableFilingCandidate }>,
  htmlCache: ReadonlyMap<string, FetchedDoc>,
): RedlineOutputItem[] {
  const currentDoc = htmlCache.get(target.accession);
  return pairs.map((p) => {
    const prevDoc = htmlCache.get(p.prev.accession);
    if (currentDoc?.status !== "ok" || prevDoc?.status !== "ok") {
      return { section: p.section, prevAccession: p.prev.accession, tooLarge: true };
    }
    return {
      section: p.section,
      prevAccession: p.prev.accession,
      built: buildFilingRedline({
        ticker,
        section: p.section,
        current: target,
        previous: p.prev,
        currentHtml: currentDoc.html,
        previousHtml: prevDoc.html,
      }),
    };
  });
}

/** Runs R1 cross-period redline extraction via periodic-only gateway with URL self-healing & streaming bounds (U0-3 / P2-1). */
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
    return sec
      ? { sec, filings: await listPeriodicFilingsBySecurity(tx, sec.id, { limit: 32 }) }
      : null;
  });
  const target = loaded ? selectPrimaryPeriodicFiling(loaded.filings, targetAcc || null) : null;
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
  const htmlCache = await resolveAndFetchHtmlMap(loaded.sec.cik, target, pairs, reason, signal);
  const outputs = buildRedlineOutputs(ticker, target, pairs, htmlCache);
  await runSystemSyncDb(reason, async (tx) => {
    for (const item of outputs) await persistOneRedline(tx, ticker, target.accession, item);
  });
  return true;
}
