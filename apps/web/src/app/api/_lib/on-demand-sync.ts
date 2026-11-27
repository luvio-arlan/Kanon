import { fetchDailyPriceBarsWithEvents, fetchSecEdgarWithPitFacts } from "@kanon/ai";
import {
  completeJob,
  getKanonDb,
  getPriceBarCoverage,
  getSecurityByTicker,
  type KanonDb,
  recordCorporateAction,
  updateThesisPriceByTicker,
  upsertPriceBars,
  upsertSecSnapshot,
  upsertSecurity,
} from "@kanon/core/db";
import { syncSecSnapshotToWarehouse } from "./sec-warehouse-sync";

export async function runSyncDailyBarsForTicker(db: KanonDb, rawTicker: string): Promise<number> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_daily_bars payload");
  const existing = await getSecurityByTicker(db, ticker);
  const security = existing ?? (await upsertSecurity(db, { ticker, name: ticker }));
  const coverage = await getPriceBarCoverage(db, security.id);
  const range = coverage.count >= 240 ? "1mo" : "5y";
  const bundle = await fetchDailyPriceBarsWithEvents({ ticker, range });
  if (bundle.bars.length > 0) {
    await upsertPriceBars(
      db,
      bundle.bars.map((b) => ({ ...b, securityId: security.id })),
    );
    const latestBar = bundle.bars[bundle.bars.length - 1];
    if (latestBar && Number.isFinite(latestBar.close) && latestBar.close > 0) {
      await updateThesisPriceByTicker(db, ticker, latestBar.close);
    }
  }
  for (const sp of bundle.splits) {
    await recordCorporateAction(db, {
      id: `split:${security.id}:${sp.exDate}`,
      securityId: security.id,
      exDate: sp.exDate,
      kind: "split",
      ratio: sp.ratio,
    });
  }
  return bundle.bars.length;
}

export async function runSyncSecForTicker(db: KanonDb, rawTicker: string): Promise<void> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!ticker) throw new Error("Missing ticker in sync_sec payload");
  const fetched = await fetchSecEdgarWithPitFacts(ticker);
  if (!fetched.ok) throw new Error(fetched.error);
  const saved = await upsertSecSnapshot(db, fetched.data);
  await syncSecSnapshotToWarehouse(db, saved, undefined, fetched.pitFacts);
}

/** Runs on-demand sync after creating a thesis (best-effort within 18s; falls back to queue). */
export async function runSingleTickerSyncBestEffort(ticker: string, day: string): Promise<void> {
  const db = await getKanonDb();
  const timeout = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error("on-demand sync timeout")), 18_000),
  );
  await Promise.race([
    (async () => {
      try {
        await runSyncDailyBarsForTicker(db, ticker);
        await completeJob(db, `sync_daily_bars:${ticker}:${day}`);
      } catch (err) {
        void err;
      }
      try {
        await runSyncSecForTicker(db, ticker);
        await completeJob(db, `sync_sec:${ticker}:${day}`);
      } catch (err) {
        void err;
      }
    })(),
    timeout,
  ]).catch(() => undefined);
}
