import { and, eq, isNull, lte } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { KanonDb } from "../../bootstrap";
import { alertRulesTable, forecastsTable, thesesTable } from "../../schema";
import { assertThesisAccess } from "../thesis/thesis-access";
import { getFactsAsOf } from "../warehouse/facts-pit-store";
import {
  computeRealHistoricalValuationBand,
  listCorporateActions,
  listPriceBars,
} from "../warehouse/price-bars-store";
import { getSecurityByTicker } from "../warehouse/securities-and-fx-store";
import { evalForm8kRule } from "./alert-form8k-eval";
import { createInboxItem } from "./inbox-and-forecasts-store";

export interface AlertEvalSummary {
  evaluatedRules: number;
  triggeredCount: number;
}

async function updateRuleState(
  db: KanonDb,
  ruleId: string,
  userId: string,
  state: "inside" | "breach",
  triggeredNow?: Date,
) {
  await db
    .update(alertRulesTable)
    .set({
      lastState: state,
      ...(triggeredNow ? { lastTriggeredAt: triggeredNow } : {}),
    })
    .where(and(eq(alertRulesTable.id, ruleId), eq(alertRulesTable.userId, userId)));
}

async function resolveLatestPrice(
  db: KanonDb,
  thesis: typeof thesesTable.$inferSelect,
): Promise<number> {
  const sec = await getSecurityByTicker(db, thesis.ticker);
  if (!sec) return thesis.currentPrice;
  const bars = await listPriceBars(db, sec.id);
  const lastClose = bars[bars.length - 1]?.close;
  return lastClose && lastClose > 0 ? lastClose : thesis.currentPrice;
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
  const price = await resolveLatestPrice(db, thesis);
  const hit = direction === "above" ? price >= target : price <= target;
  if (!hit) {
    if (rule.lastState !== "inside") {
      await updateRuleState(db, rule.id, rule.userId, "inside");
    }
    return false;
  }
  if (rule.lastState === "breach") return false;
  await createInboxItem(db, {
    userId: rule.userId,
    thesisId: thesis.id,
    kind: "price_hurdle",
    severity: "warn",
    title: `${thesis.ticker} 触发价格阈值 ($${price.toFixed(2)})`,
    body: `最新价已${direction === "above" ? "高于" : "触及/低于"}预设阈值 $${target.toFixed(2)}。`,
    sourceUrl: `alert:${rule.id}:${day}`,
  });
  await updateRuleState(db, rule.id, rule.userId, "breach", now);
  return true;
}

async function loadPeBandForThesis(
  db: KanonDb,
  ticker: string,
  day: string,
  fallbackPrice: number | null,
) {
  const sec = await getSecurityByTicker(db, ticker);
  if (!sec) return null;
  const [bars, epsFacts, sharesFacts, actions] = await Promise.all([
    listPriceBars(db, sec.id),
    getFactsAsOf(db, { securityId: sec.id, concept: "diluted_eps", asOfDate: day }),
    getFactsAsOf(db, { securityId: sec.id, concept: "diluted_shares", asOfDate: day }),
    listCorporateActions(db, sec.id),
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

async function evalPeBandBreachRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
): Promise<boolean> {
  const band = await loadPeBandForThesis(db, thesis.ticker, day, thesis.currentPrice);
  if (!band || band.current === null || band.p10 === null || band.p90 === null) return false;
  const breached = band.current <= band.p10 || band.current >= band.p90;
  if (!breached) {
    if (rule.lastState !== "inside") await updateRuleState(db, rule.id, rule.userId, "inside");
    return false;
  }
  if (rule.lastState === "breach") return false;
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
  await updateRuleState(db, rule.id, rule.userId, "breach", now);
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
  await updateRuleState(db, rule.id, rule.userId, "breach", now);
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
  const canRead = await assertThesisAccess(db, rule.thesisId, rule.userId, "read");
  if (!canRead) return false;
  const [thesis] = await db
    .select()
    .from(thesesTable)
    .where(eq(thesesTable.id, rule.thesisId))
    .limit(1);
  if (!thesis) return false;
  if (rule.kind === "price_hurdle") return evalPriceHurdleRule(db, rule, thesis, day, now);
  if (rule.kind === "pe_band_breach") return evalPeBandBreachRule(db, rule, thesis, day, now);
  if (rule.kind === "form8k_redflag") {
    return evalForm8kRule(db, rule, thesis, now, () =>
      updateRuleState(db, rule.id, rule.userId, "breach", now),
    );
  }
  return false;
}

/** Evaluates all enabled alert rules with edge-triggered state transitions and org-shared thesis support. */
export async function evaluateAlertRules(db: KanonDb, now = new Date()): Promise<AlertEvalSummary> {
  const day = now.toISOString().slice(0, 10) || todayIsoUtc();
  const rules = await db.select().from(alertRulesTable).where(eq(alertRulesTable.enabled, true));
  let triggeredCount = 0;
  for (const rule of rules) {
    if (await evaluateSingleRule(db, rule, day, now)) triggeredCount += 1;
  }
  return { evaluatedRules: rules.length, triggeredCount };
}
