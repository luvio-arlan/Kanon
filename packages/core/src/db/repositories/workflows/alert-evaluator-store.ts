import { and, eq, isNull, lte } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
import { alertRulesTable, filingsTable, forecastsTable, thesesTable } from "../../schema";
import { getFactsAsOf } from "../warehouse/facts-pit-store";
import {
  computeRealHistoricalValuationBand,
  listCorporateActions,
  listPriceBars,
} from "../warehouse/price-bars-store";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";
import { createInboxItem } from "./inbox-and-forecasts-store";

export interface AlertEvalSummary {
  evaluatedRules: number;
  triggeredCount: number;
}

async function markRuleTriggered(db: KanonDb, ruleId: string, userId: string, now: Date) {
  await db
    .update(alertRulesTable)
    .set({ lastTriggeredAt: now })
    .where(and(eq(alertRulesTable.id, ruleId), eq(alertRulesTable.userId, userId)));
}

async function evalPriceHurdleRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  const target = Number(rule.configJson.targetPrice);
  if (!Number.isFinite(target) || target <= 0) return false;
  const direction = rule.configJson.direction === "above" ? "above" : "below";
  const hit = direction === "above" ? thesis.currentPrice >= target : thesis.currentPrice <= target;
  if (!hit) return false;
  await createInboxItem(db, {
    userId: rule.userId,
    thesisId: thesis.id,
    kind: "price_hurdle",
    severity: "warn",
    title: `${thesis.ticker} 触发价格阈值 ($${thesis.currentPrice.toFixed(2)})`,
    body: `当前价已${direction === "above" ? "高于" : "触及/低于"}预设阈值 $${target.toFixed(2)}。`,
    sourceUrl: `alert:${rule.id}:${day}`,
  });
  await markRuleTriggered(db, rule.id, rule.userId, now);
  return true;
}

async function evalPeBandBreachRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  const sec = await getSecurityByTicker(db, thesis.ticker);
  if (!sec) return false;
  const [bars, epsFacts, actions] = await Promise.all([
    listPriceBars(db, sec.id),
    getFactsAsOf(db, { securityId: sec.id, concept: "diluted_eps", asOfDate: day }),
    listCorporateActions(db, sec.id),
  ]);
  const splits = actions
    .filter(
      (a): a is typeof a & { ratio: number } =>
        a.kind === "split" && typeof a.ratio === "number" && a.ratio > 0,
    )
    .map((a) => ({ exDate: a.exDate, ratio: a.ratio }));
  const band = computeRealHistoricalValuationBand({
    bars,
    annuals: [],
    pitEpsFacts: epsFacts,
    splits,
    currentPrice: thesis.currentPrice,
  });
  if (!band || band.current === null || band.p10 === null || band.p90 === null) return false;
  if (band.current > band.p10 && band.current < band.p90) return false;
  const label = band.current <= band.p10 ? "低于历史 P10" : "高于历史 P90";
  await createInboxItem(db, {
    userId: rule.userId,
    thesisId: thesis.id,
    kind: "pe_band_breach",
    severity: "info",
    title: `${thesis.ticker} 估值分位越界（${band.current}×，${label}）`,
    body: `当前 P/E ${band.current}×，历史区间 P10 ${band.p10}× / P50 ${band.p50}× / P90 ${band.p90}×。`,
    sourceUrl: `alert:${rule.id}:${day}`,
  });
  await markRuleTriggered(db, rule.id, rule.userId, now);
  return true;
}

async function evalForecastDueRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  const conds = [
    eq(forecastsTable.userId, rule.userId),
    isNull(forecastsTable.resolvedAt),
    lte(forecastsTable.resolveBy, day),
  ];
  if (rule.thesisId) conds.push(eq(forecastsTable.thesisId, rule.thesisId));
  const due = await db
    .select()
    .from(forecastsTable)
    .where(and(...conds))
    .limit(5);
  if (due.length === 0) return false;
  for (const fc of due) {
    await createInboxItem(db, {
      userId: rule.userId,
      thesisId: fc.thesisId,
      kind: "forecast_due",
      severity: "warn",
      title: `预测已到期待结算：${fc.question.slice(0, 48)}`,
      body: `到期日 ${fc.resolveBy}，请前往 Step 5 结算结果并更新 Brier 校准分。`,
      sourceUrl: `alert:${rule.id}:${fc.id}`,
    });
  }
  await markRuleTriggered(db, rule.id, rule.userId, now);
  return true;
}

async function evalForm8kRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  const sec = await getSecurityByTicker(db, thesis.ticker);
  if (!sec) return false;
  const rows = await db
    .select()
    .from(filingsTable)
    .where(and(eq(filingsTable.securityId, sec.id), eq(filingsTable.form, "8-K")))
    .limit(5);
  const recent = rows.find((r) => r.filedAt >= day.slice(0, 7));
  if (!recent) return false;
  await createInboxItem(db, {
    userId: rule.userId,
    thesisId: thesis.id,
    kind: "form8k_redflag",
    severity: "critical",
    title: `${thesis.ticker} 新增 8-K 重大公告（${recent.filedAt}）`,
    body: `申报编号 ${recent.accession}，请核查是否涉及核心假设变更。`,
    sourceUrl: `alert:${rule.id}:${recent.accession}`,
  });
  await markRuleTriggered(db, rule.id, rule.userId, now);
  return true;
}

async function evaluateSingleRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  if (rule.kind === "forecast_due") return evalForecastDueRule(db, rule, day, now);
  if (!rule.thesisId) return false;
  const [thesis] = await db
    .select()
    .from(thesesTable)
    .where(and(eq(thesesTable.id, rule.thesisId), eq(thesesTable.userId, rule.userId)))
    .limit(1);
  if (!thesis) return false;
  if (rule.kind === "price_hurdle") return evalPriceHurdleRule(db, rule, thesis, day, now);
  if (rule.kind === "pe_band_breach") return evalPeBandBreachRule(db, rule, thesis, day, now);
  if (rule.kind === "form8k_redflag") return evalForm8kRule(db, rule, thesis, day, now);
  return false;
}

/** Evaluates all enabled alert rules, emits deduplicated inbox notifications, and records `last_triggered_at`. */
export async function evaluateAlertRules(db: KanonDb, now = new Date()): Promise<AlertEvalSummary> {
  const day = now.toISOString().slice(0, 10) || todayIsoUtc();
  const rules = await db.select().from(alertRulesTable).where(eq(alertRulesTable.enabled, true));
  let triggeredCount = 0;
  for (const rule of rules) {
    if (await evaluateSingleRule(db, rule, day, now)) triggeredCount += 1;
  }
  return { evaluatedRules: rules.length, triggeredCount };
}
