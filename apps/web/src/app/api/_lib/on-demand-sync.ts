import {
  type DailyPriceBarsBundle,
  fetchDailyPriceBarsWithEvents,
  fetchSecEdgarWithPitFacts,
  registerSecGlobalSlotAcquirer,
} from "@kanon/ai";
import {
  completeJob,
  getPriceBarCoverage,
  getSecurityByTicker,
  type KanonDb,
  listCorporateActions,
  listPriceBars,
  markSecuritySecStatus,
  recordCorporateAction,
  replacePriceBarsForSecurity,
  skipJob,
  updateThesisPriceByTicker,
  upsertPriceBars,
  upsertSecurity,
} from "@kanon/core/db";
import { withSystemDb } from "./db-context";
import { generateRequestId, logStructuredApiEvent } from "./logger";
import { acquireSecGlobalSlot } from "./request-guards";
import {
  commitSecSnapshotAndWarehouseAtomic,
  drainAlertFanoutJobsBestEffort,
  prepareSecSnapshotCommit,
} from "./sec-warehouse-sync";

registerSecGlobalSlotAcquirer((signal) => acquireSecGlobalSlot(signal));

const REBASE_REL_DIFF_THRESHOLD = 0.001;

function logSyncFailure(route: string, code: string, err: unknown, startedAt: number) {
  logStructuredApiEvent({
    level: "warn",
    requestId: generateRequestId(),
    route,
    status: 500,
    durationMs: Math.round(performance.now() - startedAt),
    code,
    message: err instanceof Error ? err.message : String(err),
  });
}

function hasBarBasisDrift(
  bars: DailyPriceBarsBundle["bars"],
  byDate: ReadonlyMap<string, { source: string; close: number; adjClose: number }>,
): boolean {
  for (const bar of bars) {
    const dbBar = byDate.get(bar.barDate);
    if (!dbBar) continue;
    if (dbBar.source !== bar.source) return true;
    const closeDiff = Math.abs(bar.close - dbBar.close) / Math.max(1e-9, Math.abs(dbBar.close));
    const adjDiff =
      Math.abs(bar.adjClose - dbBar.adjClose) / Math.max(1e-9, Math.abs(dbBar.adjClose));
    return closeDiff > REBASE_REL_DIFF_THRESHOLD || adjDiff > REBASE_REL_DIFF_THRESHOLD;
  }
  return false;
}

async function detectBasisDriftOrNewEvents(
  securityId: string,
  bundle: DailyPriceBarsBundle,
): Promise<boolean> {
  const firstDate = bundle.bars[0]?.barDate;
  const lastDate = bundle.bars[bundle.bars.length - 1]?.barDate;
  if (!firstDate || !lastDate) return false;
  const [existingBars, existingActions] = await withSystemDb("on_demand_sync", (tx) =>
    Promise.all([
      listPriceBars(tx, securityId, { fromDate: firstDate, toDate: lastDate }),
      listCorporateActions(tx, securityId),
    ]),
  );
  const actionIds = new Set(existingActions.map((a) => a.id));
  const hasNewSplit = bundle.splits.some(
    (sp) => !actionIds.has(`split:${securityId}:${sp.exDate}`),
  );
  const hasNewDiv = bundle.dividends.some((d) => !actionIds.has(`div:${securityId}:${d.exDate}`));
  if (hasNewSplit || hasNewDiv) return true;
  return hasBarBasisDrift(bundle.bars, new Map(existingBars.map((b) => [b.barDate, b])));
}

async function persistBundleCorporateActions(
  tx: KanonDb,
  securityId: string,
  bundle: DailyPriceBarsBundle,
) {
  for (const sp of bundle.splits) {
    await recordCorporateAction(tx, {
      id: `split:${securityId}:${sp.exDate}`,
      securityId,
      exDate: sp.exDate,
      kind: "split",
      ratio: sp.ratio,
    });
  }
  for (const div of bundle.dividends) {
    await recordCorporateAction(tx, {
      id: `div:${securityId}:${div.exDate}`,
      securityId,
      exDate: div.exDate,
      kind: "dividend",
      amount: div.amount,
    });
  }
}

export async function runSyncDailyBarsForTicker(
  rawTicker: string,
  options?: {
    forceFullRebase?: boolean;
    signal?: AbortSignal;
    fetchBars?: typeof fetchDailyPriceBarsWithEvents;
  },
): Promise<number> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_daily_bars payload");
  const fetchBars = options?.fetchBars ?? fetchDailyPriceBarsWithEvents;
  const { security, coverage } = await withSystemDb("on_demand_sync", async (tx) => {
    const existing = await getSecurityByTicker(tx, ticker);
    const sec = existing ?? (await upsertSecurity(tx, { ticker, name: ticker }));
    const cov = await getPriceBarCoverage(tx, sec.id);
    return { security: sec, coverage: cov };
  });
  const initialRange = options?.forceFullRebase || coverage.count < 240 ? "5y" : "1mo";
  let bundle = await fetchBars({ ticker, range: initialRange, signal: options?.signal });
  let fullReplace = options?.forceFullRebase === true;
  if (initialRange === "1mo" && (await detectBasisDriftOrNewEvents(security.id, bundle))) {
    bundle = await fetchBars({ ticker, range: "5y", signal: options?.signal });
    fullReplace = true;
  }
  await withSystemDb("on_demand_sync", async (tx) => {
    if (bundle.bars.length > 0) {
      const mapped = bundle.bars.map((b) => ({ ...b, securityId: security.id }));
      if (fullReplace) await replacePriceBarsForSecurity(tx, security.id, mapped);
      else await upsertPriceBars(tx, mapped);
      const latestBar = bundle.bars[bundle.bars.length - 1];
      if (latestBar && Number.isFinite(latestBar.close) && latestBar.close > 0) {
        await updateThesisPriceByTicker(tx, ticker, latestBar.close);
      }
    }
    await persistBundleCorporateActions(tx, security.id, bundle);
  });
  return bundle.bars.length;
}

export async function runSyncSecForTicker(
  rawTicker: string,
  options?: {
    signal?: AbortSignal;
    fetchSec?: typeof fetchSecEdgarWithPitFacts;
  },
): Promise<{ status: "synced" } | { status: "skipped"; reason: string }> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_sec payload");
  const fetchSec = options?.fetchSec ?? fetchSecEdgarWithPitFacts;
  const fetched = await fetchSec(ticker, undefined, { signal: options?.signal });
  if (!fetched.ok) {
    if (fetched.errorKind === "not_sec_registrant") {
      await withSystemDb("on_demand_sync", (tx) =>
        markSecuritySecStatus(tx, ticker, "not_registrant"),
      );
      return { status: "skipped", reason: fetched.error };
    }
    throw new Error(fetched.error);
  }
  const prepared = prepareSecSnapshotCommit(fetched.data);
  await withSystemDb("on_demand_sync", (tx) =>
    commitSecSnapshotAndWarehouseAtomic(tx, prepared, fetched.pitFacts),
  );
  if (prepared.fanout8kJobs.length > 0) {
    await drainAlertFanoutJobsBestEffort(prepared.fanout8kJobs.length).catch(() => undefined);
  }
  return { status: "synced" };
}

/** Runs on-demand sync after creating a thesis with 18s AbortSignal and structured error logging. */
export async function runSingleTickerSyncBestEffort(
  ticker: string,
  day: string,
  options?: { timeoutMs?: number },
): Promise<void> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("on-demand sync timeout")),
    options?.timeoutMs ?? 18_000,
  );
  try {
    try {
      await runSyncDailyBarsForTicker(ticker, { signal: controller.signal });
      await withSystemDb("on_demand_sync", (tx) =>
        completeJob(tx, `sync_daily_bars:${ticker}:${day}`),
      );
    } catch (err) {
      logSyncFailure(`/api/theses/sync/${ticker}`, "ON_DEMAND_SYNC_FAILED", err, startedAt);
    }
    if (controller.signal.aborted) return;
    try {
      const outcome = await runSyncSecForTicker(ticker, { signal: controller.signal });
      if (outcome.status === "skipped") {
        await withSystemDb("on_demand_sync", (tx) =>
          skipJob(tx, `sync_sec:${ticker}:${day}`, outcome.reason),
        );
      } else {
        await withSystemDb("on_demand_sync", (tx) => completeJob(tx, `sync_sec:${ticker}:${day}`));
      }
    } catch (err) {
      logSyncFailure(`/api/theses/sync/${ticker}`, "ON_DEMAND_SYNC_FAILED", err, startedAt);
    }
  } finally {
    clearTimeout(timer);
  }
}
