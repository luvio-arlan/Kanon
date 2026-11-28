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
  loadPortfolioAnalyticsContext,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * Decision episodes are measured in each trade's own currency: they grade the security call, not FX.
 * Legacy currency-unconfirmed accounts are never graded (V0-4).
 */
async function loadAttributionData(tx: KanonDb, userId: string, accountId: string | null) {
  const [ctx, snapshots] = await Promise.all([
    loadPortfolioAnalyticsContext(tx, { userId, accountId }),
    listDecisionSnapshotsByUser(tx, userId),
  ]);
  if (ctx.kind !== "ready") return { kind: ctx.kind } as const;
  if (ctx.transactions.length === 0) return { kind: "no_account" } as const;
  const thesisIds = [
    ...new Set(
      [...ctx.transactions.map((t) => t.thesisId), ...snapshots.map((s) => s.thesisId)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const [hypEvents, migration0033AppliedAt] = await Promise.all([
    listHypothesisStatusEventsByThesisIds(tx, thesisIds),
    getMigration0033AppliedAt(tx),
  ]);
  return {
    kind: "ready",
    transactions: ctx.transactions,
    snapshots,
    market: ctx.market,
    hypEvents,
    migration0033AppliedAt,
  } as const;
}

function buildAttributionReport(
  loaded: Extract<Awaited<ReturnType<typeof loadAttributionData>>, { kind: "ready" }>,
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
    transactions: loaded.transactions,
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
  if (loaded.kind !== "ready") {
    return jsonOk(
      PortfolioAttributionResponseSchema.parse({
        status: loaded.kind === "currency_unconfirmed" ? "currency_unconfirmed" : "empty",
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
