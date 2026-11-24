import { fetchMarketClosingQuote, fetchSecEdgarSnapshot } from "@kanon/ai";
import { MarketBootstrapResponseSchema } from "@kanon/core";
import { getKanonDb, getSecSnapshot, upsertSecSnapshot } from "@kanon/core/db";
import { jsonError, jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

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
  currentPrice: number | null,
) {
  const parts: string[] = [];
  if (years > 0) parts.push(`已匹配 ${years} 年 SEC 财务`);
  if (latestEps !== null) parts.push(`最新 EPS $${latestEps.toFixed(2)}`);
  if (currentPrice !== null) parts.push(`收盘参考价 $${currentPrice.toFixed(2)}`);
  return parts.length > 0
    ? parts.join(" · ")
    : "未自动检索到外部数据，请手动补全公司名称与当前参考价。";
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const rawTicker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9.-]{1,10}$/.test(rawTicker)) {
    return jsonError("请输入有效的美股代码（如 NVDA / AVGO）。", 400, startedAt, "INVALID");
  }

  const db = await getKanonDb();
  const [secLive, quoteRes, secCached] = await Promise.all([
    fetchSecEdgarSnapshot(rawTicker),
    fetchMarketClosingQuote(rawTicker),
    getSecSnapshot(db, rawTicker),
  ]);
  const snapshot = secLive.ok ? await upsertSecSnapshot(db, secLive.data) : secCached;
  const companyName = snapshot?.entityName || (quoteRes.ok ? (quoteRes.companyName ?? "") : "");
  const currentPrice = quoteRes.ok ? quoteRes.price : null;
  const latestEps = latestAnnualEps(snapshot?.annuals ?? []);
  const years = snapshot?.annuals.length ?? 0;

  return jsonOk(
    MarketBootstrapResponseSchema.parse({
      ticker: rawTicker,
      companyName,
      currentPrice,
      priceSource: quoteRes.ok ? quoteRes.source : "none",
      latestEps,
      secYearsCovered: years,
      secCached: Boolean(snapshot),
      notice: buildBootstrapNotice(years, latestEps, currentPrice),
    }),
    startedAt,
  );
}
