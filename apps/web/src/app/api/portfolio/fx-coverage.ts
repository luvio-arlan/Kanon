import { fetchEcbReferenceFxRates } from "@kanon/ai";
import {
  findFxBackfillStart,
  type KanonDb,
  loadPortfolioAnalyticsContext,
  type PortfolioAnalyticsContext,
  upsertFxRates,
} from "@kanon/core/db";
import { withSystemDb } from "../_lib/db-context";
import { generateRequestId, logStructuredApiEvent } from "../_lib/logger";

/**
 * Guarantees ECB reference rates cover `[fromDate, today]` for `currencies` BEFORE any tenant transaction
 * (network stays outside DB transactions — G10). On upstream failure it returns `"failed"`; callers then fail
 * closed (`FX_UNAVAILABLE` / `fxGaps`) instead of estimating (V0-2).
 */
export async function ensureFxCoverage(
  currencies: readonly string[],
  fromDate: string,
  route: string,
): Promise<"covered" | "fetched" | "failed"> {
  const startedAt = performance.now();
  const today = new Date().toISOString().slice(0, 10);
  const startPeriod = await withSystemDb("user_triggered_sync", (tx) =>
    findFxBackfillStart(tx, { currencies, fromDate, today }),
  );
  if (!startPeriod) return "covered";
  try {
    const rows = await fetchEcbReferenceFxRates({ startPeriod });
    if (rows.length === 0) return "failed";
    await withSystemDb("user_triggered_sync", (tx) => upsertFxRates(tx, rows));
    return "fetched";
  } catch (err) {
    logStructuredApiEvent({
      level: "warn",
      requestId: generateRequestId(),
      route,
      status: 502,
      durationMs: Math.round(performance.now() - startedAt),
      code: "FX_BACKFILL_FAILED",
      message: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

/**
 * Loads the tenant analytics context, backfilling ECB coverage (outside the tenant tx) and reloading once
 * when non-USD currencies are involved. Shared by performance, risk and attribution (V0-2 / V0-3).
 */
export async function loadAnalyticsContextWithFx(
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  params: Parameters<typeof loadPortfolioAnalyticsContext>[1],
  route: string,
): Promise<PortfolioAnalyticsContext> {
  const load = () => withDb((tx) => loadPortfolioAnalyticsContext(tx, params));
  const ctx = await load();
  if (ctx.kind !== "ready" || !ctx.firstTradeDate || ctx.currencies.every((c) => c === "USD")) {
    return ctx;
  }
  const outcome = await ensureFxCoverage(ctx.currencies, ctx.firstTradeDate, route);
  return outcome === "fetched" ? load() : ctx;
}
