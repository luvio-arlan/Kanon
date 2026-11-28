import {
  buildPortfolioPerformanceSeries,
  emptyPerformance,
  PortfolioPerformanceResponseSchema,
  todayIsoUtc,
} from "@kanon/core";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";
import { loadAnalyticsContextWithFx } from "../fx-coverage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const accountId = new URL(request.url).searchParams.get("accountId")?.trim() || null;
  const ctx = await loadAnalyticsContextWithFx(
    auth.withDb,
    { userId: auth.user.id, accountId },
    "/api/portfolio/performance",
  );
  if (ctx.kind === "no_account") {
    return jsonOk({ ...emptyPerformance(null), status: "no_account" }, startedAt);
  }
  if (ctx.kind === "currency_unconfirmed") {
    return jsonOk(
      { ...emptyPerformance(ctx.accountId), status: "currency_unconfirmed" },
      startedAt,
    );
  }
  const perf = buildPortfolioPerformanceSeries({
    accountId: ctx.accountId,
    baseCurrency: ctx.baseCurrency,
    transactions: ctx.transactions,
    barsByTicker: ctx.market.barsByTicker,
    splitsByTicker: ctx.market.splitsByTicker,
    dividendsByTicker: ctx.market.dividendsByTicker,
    fxRatesByCurrency: ctx.fxRatesByCurrency,
    spyBars: ctx.market.spyBars,
    spyDividends: ctx.market.spyDividends,
    asOfDate: todayIsoUtc(),
  });
  return jsonOk(PortfolioPerformanceResponseSchema.parse(perf), startedAt);
}
