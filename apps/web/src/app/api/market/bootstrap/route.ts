import { fetchMarketQuote, fetchMarketSparkline, fetchSecEdgarSnapshot } from "@kanon/ai";
import { MarketBootstrapResponseSchema, type MarketQuoteSnapshot } from "@kanon/core";
import { getSecSnapshotForUser, type KanonDb, upsertSecSnapshot } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const BOOTSTRAP_RATE_POLICY = { bucket: "market_bootstrap", maxRequests: 25, windowMs: 60 * 1000 };

function latestAnnualEps(annuals: ReadonlyArray<{ dilutedEps: number | null }>): number | null {
  for (let i = annuals.length - 1; i >= 0; i -= 1) {
    const eps = annuals[i]?.dilutedEps;
    if (typeof eps === "number" && eps > 0) return eps;
  }
  return null;
}

function buildBootstrapNotice(
  years: number,
  latestEps: number | null,
  quote: MarketQuoteSnapshot | null,
) {
  const parts: string[] = [];
  if (years > 0) parts.push(`已匹配 ${years} 年 SEC 财务`);
  if (latestEps !== null) parts.push(`最新 EPS $${latestEps.toFixed(2)}`);
  if (quote) {
    const ext =
      quote.sessionState === "PRE" && quote.preMarketPrice
        ? `（盘前 $${quote.preMarketPrice.toFixed(2)}）`
        : quote.sessionState === "POST" && quote.postMarketPrice
          ? `（盘后 $${quote.postMarketPrice.toFixed(2)}）`
          : "";
    parts.push(`现价 $${quote.regularPrice.toFixed(2)}${ext}`);
  }
  return parts.length > 0
    ? parts.join(" · ")
    : "未自动检索到外部数据，请手动补全公司名称与当前参考价。";
}

async function resolveBootstrapSec(
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  secLive: Awaited<ReturnType<typeof fetchSecEdgarSnapshot>>,
  secCached: Awaited<ReturnType<typeof getSecSnapshotForUser>>,
) {
  if (secCached?.source === "manual-verified") return secCached;
  if (secLive.ok) return withDb((tx) => upsertSecSnapshot(tx, secLive.data));
  return secCached;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(request, BOOTSTRAP_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const rawTicker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9.-]{1,10}$/.test(rawTicker)) {
    return jsonError("请输入有效的美股代码（如 NVDA / AVGO）。", 400, startedAt, "INVALID");
  }

  const [secLive, quoteRes, secCached, sparkline] = await Promise.all([
    fetchSecEdgarSnapshot(rawTicker),
    fetchMarketQuote(rawTicker, { creds: parseMarketHeaders(request) }),
    auth.withDb((tx) => getSecSnapshotForUser(tx, rawTicker, auth.user.id)),
    fetchMarketSparkline(rawTicker),
  ]);
  const snapshot = await resolveBootstrapSec(auth.withDb, secLive, secCached);
  const quote = quoteRes.ok ? quoteRes.quote : null;
  const latestEps = latestAnnualEps(snapshot?.annuals ?? []);
  const years = snapshot?.annuals.length ?? 0;

  return jsonOk(
    MarketBootstrapResponseSchema.parse({
      ticker: rawTicker,
      companyName: snapshot?.entityName || quote?.companyName || "",
      currentPrice: quote?.effectivePrice ?? null,
      priceSource: quote?.source ?? "none",
      latestEps,
      secYearsCovered: years,
      secCached: Boolean(snapshot),
      notice: buildBootstrapNotice(years, latestEps, quote),
      quote,
      sparkline: sparkline.length >= 2 ? sparkline : undefined,
    }),
    startedAt,
  );
}
