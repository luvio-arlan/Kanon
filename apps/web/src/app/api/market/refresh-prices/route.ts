import { fetchMarketClosingQuotes } from "@kanon/ai";
import { RefreshPricesResponseSchema, type ThesisDetail } from "@kanon/core";
import { getKanonDb, listTheses, updateThesisStep } from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";

export const dynamic = "force-dynamic";

function formatShortDateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}收盘`;
}

function buildRefreshNotice(updatedCount: number, skippedTickers: readonly string[]): string {
  if (updatedCount === 0) return "外部收盘价接口暂不可用，已保留全部现有参考价。";
  const skipSuffix = skippedTickers.length > 0 ? `（${skippedTickers.join("/")} 保留原价）` : "";
  return `已校准 ${updatedCount} 只标的收盘参考价${skipSuffix}`;
}

export async function POST() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const db = await getKanonDb();
  const all = await listTheses(db, auth.user.id);
  const active = all.filter((item) => item.status === "active");
  const quotes = await fetchMarketClosingQuotes(active.map((item) => item.ticker));
  const label = formatShortDateLabel(new Date());

  let updatedCount = 0;
  const skippedTickers: string[] = [];
  const updatedMap = new Map<string, ThesisDetail>();

  for (const item of active) {
    const quote = quotes.get(item.ticker);
    if (!quote?.ok) {
      skippedTickers.push(item.ticker);
      continue;
    }
    if (Math.abs(quote.price - item.currentPrice) >= 0.01) {
      const next = await updateThesisStep(
        db,
        item.id,
        { step: "price_anchor", currentPrice: quote.price, label },
        auth.user.id,
      );
      if (next) updatedMap.set(item.id, next);
    }
    updatedCount += 1;
  }

  const updatedTheses = all.map((item) => updatedMap.get(item.id) ?? item);
  const payload = RefreshPricesResponseSchema.parse({
    updatedTheses,
    updatedCount,
    skippedTickers,
    notice: buildRefreshNotice(updatedCount, skippedTickers),
  });
  return jsonOk(payload, startedAt);
}
