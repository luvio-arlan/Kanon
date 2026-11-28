import {
  buildDecisionEpisodes,
  classifyDecisionMatrix,
  PortfolioAttributionResponseSchema,
  todayIsoUtc,
} from "@kanon/core";
import {
  getMigration0033AppliedAt,
  type KanonDb,
  listDecisionSnapshotsByUser,
  listHypothesisStatusEventsByThesisIds,
  loadTenantAccountAndTransactions,
  loadUnadjustedMarketDataForTickers,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

async function loadAttributionData(tx: KanonDb, userId: string, accountId: string | null) {
  const [{ account, transactions }, snapshots] = await Promise.all([
    loadTenantAccountAndTransactions(tx, userId, accountId),
    listDecisionSnapshotsByUser(tx, userId),
  ]);
  if (!account || transactions.length === 0) return null;
  const tickers = transactions.map((t) => t.ticker).filter((t) => t !== "CASH");
  const thesisIds = [
    ...new Set(
      [...transactions.map((t) => t.thesisId), ...snapshots.map((s) => s.thesisId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const [market, hypEvents, migration0033AppliedAt] = await Promise.all([
    loadUnadjustedMarketDataForTickers(tx, tickers),
    listHypothesisStatusEventsByThesisIds(tx, thesisIds),
    getMigration0033AppliedAt(tx),
  ]);
  return { transactions, snapshots, market, hypEvents, migration0033AppliedAt };
}

function buildAttributionReport(
  loaded: NonNullable<Awaited<ReturnType<typeof loadAttributionData>>>,
) {
  const snapshotsByTxId = new Map(
    loaded.snapshots.map((s) => [
      s.transactionId,
      {
        transactionId: s.transactionId,
        thesisId: s.thesisId,
        snapshotHash: s.snapshotHash,
        hypothesisIds: s.payloadJson.hypotheses.map((h) => h.id),
      },
    ]),
  );
  const asOfDate = todayIsoUtc();
  const episodes = buildDecisionEpisodes({
    transactions: loaded.transactions.map((t) => ({
      id: t.id,
      thesisId: t.thesisId,
      ticker: t.ticker,
      action: t.action,
      quantity: t.quantity,
      price: t.price,
      fees: t.fees,
      reversesTxId: t.reversesTxId,
      tradeDate: t.tradeDate,
      createdAtMs: t.createdAt.getTime(),
    })),
    snapshotsByTxId,
    splitsByTicker: loaded.market.splitsByTicker,
    latestCloseByTicker: loaded.market.latestCloseByTicker,
    asOfDate,
  });
  return classifyDecisionMatrix({
    episodes,
    hypothesisEvents: loaded.hypEvents.map((e) => ({
      thesisId: e.thesisId,
      hypothesisId: e.hypothesisId,
      toStatus: e.toStatus,
      source: e.source,
      recordedAt: e.recordedAt.toISOString(),
    })),
    barsByTicker: loaded.market.barsByTicker,
    dividendsByTicker: loaded.market.dividendsByTicker,
    spyBars: loaded.market.spyBars,
    spyDividends: loaded.market.spyDividends,
    asOfDate,
    migration0033AppliedAt: loaded.migration0033AppliedAt,
  });
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || null;
  const loaded = await auth.withDb((tx) => loadAttributionData(tx, auth.user.id, accountId));
  if (!loaded) {
    return jsonOk(
      PortfolioAttributionResponseSchema.parse({
        status: "empty",
        counts: { skill: 0, good_process_bad_luck: 0, lucky: 0, mistake: 0, pending: 0 },
        outcomeBasisCounts: { idiosyncratic: 0, excess_vs_spy: 0, unavailable: 0 },
        skillRatePct: null,
        episodes: [],
      }),
      startedAt,
    );
  }
  return jsonOk(
    PortfolioAttributionResponseSchema.parse(buildAttributionReport(loaded)),
    startedAt,
  );
}
