import { and, desc, eq, gt } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { type alertRulesTable, filingsTable, type thesesTable } from "../../schema";
import { getFactsAsOf } from "../warehouse/facts-pit-store";
import {
  computeRealHistoricalValuationBand,
  listCorporateActions,
  listPriceBars,
} from "../warehouse/price-bars-store";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";
import { createInboxItem } from "./inbox-and-forecasts-store";

export async function loadPeBandForSecurity(
  db: KanonDb,
  securityId: string,
  day: string,
  fallbackPrice: number | null,
) {
  const [bars, epsFacts, sharesFacts, actions] = await Promise.all([
    listPriceBars(db, securityId),
    getFactsAsOf(db, { securityId, concept: "diluted_eps", asOfDate: day }),
    getFactsAsOf(db, { securityId, concept: "diluted_shares", asOfDate: day }),
    listCorporateActions(db, securityId),
  ]);
  const splits = actions
    .filter(
      (a): a is typeof a & { ratio: number } =>
        a.kind === "split" && typeof a.ratio === "number" && a.ratio > 0,
    )
    .map((a) => ({ exDate: a.exDate, ratio: a.ratio }));
  return computeRealHistoricalValuationBand({
    bars,
    annuals: [],
    pitEpsFacts: epsFacts,
    pitSharesFacts: sharesFacts,
    splits,
    currentPrice: bars[bars.length - 1]?.close ?? fallbackPrice,
  });
}

const CRITICAL_8K_ITEMS = new Set(["1.03", "2.06", "3.01", "4.01", "4.02", "5.02"]);

async function emitForm8kFilingAlerts(
  db: KanonDb,
  userId: string,
  thesis: typeof thesesTable.$inferSelect,
  row: typeof filingsTable.$inferSelect,
): Promise<boolean> {
  const items = row.items.length > 0 ? row.items : ["general"];
  const criticalItems = items.filter((code) => CRITICAL_8K_ITEMS.has(code));
  const targetItems = criticalItems.length > 0 ? criticalItems : [items[0] ?? "general"];
  const severity = criticalItems.length > 0 ? "critical" : "warn";
  for (const itemCode of targetItems) {
    await createInboxItem(db, {
      userId,
      thesisId: thesis.id,
      kind: "form8k_redflag",
      severity,
      title: `${thesis.ticker} 新增 8-K 重大公告（${row.filedAt} · Item ${itemCode}）`,
      body: `申报编号 ${row.accession}，请核查是否涉及核心假设变更。`,
      sourceUrl: `8k:${row.accession}:${itemCode}`,
    });
  }
  return targetItems.length > 0;
}

export async function evalForm8kRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  now: Date,
  onEmitted: () => Promise<void>,
): Promise<boolean> {
  const sec = await getSecurityByTicker(db, thesis.ticker);
  if (!sec) return false;
  const fallbackSince = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const sinceDate = rule.lastTriggeredAt
    ? rule.lastTriggeredAt.toISOString().slice(0, 10)
    : fallbackSince;
  const rows = await db
    .select()
    .from(filingsTable)
    .where(
      and(
        eq(filingsTable.securityId, sec.id),
        eq(filingsTable.form, "8-K"),
        gt(filingsTable.filedAt, sinceDate),
      ),
    )
    .orderBy(desc(filingsTable.filedAt))
    .limit(10);
  let emitted = false;
  for (const row of rows) {
    if (await emitForm8kFilingAlerts(db, rule.userId, thesis, row)) emitted = true;
  }
  if (emitted) await onEmitted();
  return emitted;
}
