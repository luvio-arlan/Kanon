import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";
import { todayIsoUtc } from "../../../contracts/workflow-contracts";
import type { ValuationBand } from "../../../schemas/v7-research-os";
import type { KanonDb } from "../../bootstrap";
import { alertRulesTable, forecastsTable, thesesTable } from "../../schema";
import { assertThesisAccess } from "../thesis/thesis-access";
import { getLatestPriceBar } from "../warehouse/price-bars-store";
import { getSecurityByTicker, type SecurityRecord } from "../warehouse/securities-and-fx-store";
import { evalForm8kRule, loadPeBandForSecurity } from "./alert-form8k-eval";
import { createInboxItem } from "./inbox-and-forecasts-store";

export interface AlertEvalSummary {
  evaluatedRules: number;
  triggeredCount: number;
  completed: boolean;
  nextCursor: string | null;
}

export interface AlertEvalOptions {
  now?: Date;
  budgetMs?: number;
  afterRuleId?: string | null;
}

interface EvalTickCache {
  securityByTicker: Map<string, SecurityRecord | null>;
  priceByTicker: Map<string, number>;
  bandByTicker: Map<string, ValuationBand | null>;
  thesisById: Map<string, typeof thesesTable.$inferSelect | null>;
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

async function resolveSecurityCached(db: KanonDb, ticker: string, cache: EvalTickCache) {
  const key = ticker.trim().toUpperCase();
  if (cache.securityByTicker.has(key)) return cache.securityByTicker.get(key) ?? null;
  const sec = await getSecurityByTicker(db, key);
  cache.securityByTicker.set(key, sec);
  return sec;
}

async function resolveLatestPrice(
  db: KanonDb,
  thesis: typeof thesesTable.$inferSelect,
  cache: EvalTickCache,
): Promise<number> {
  const key = thesis.ticker.trim().toUpperCase();
  const cached = cache.priceByTicker.get(key);
  if (cached !== undefined) return cached;
  const sec = await resolveSecurityCached(db, key, cache);
  const latestBar = sec ? await getLatestPriceBar(db, sec.id) : null;
  const resolved = latestBar && latestBar.close > 0 ? latestBar.close : thesis.currentPrice;
  cache.priceByTicker.set(key, resolved);
  return resolved;
}

async function evalPriceHurdleRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
  cache: EvalTickCache,
): Promise<boolean> {
  const target = Number(rule.configJson.targetPrice);
  if (!Number.isFinite(target) || target <= 0) return false;
  const direction = rule.configJson.direction === "above" ? "above" : "below";
  const price = await resolveLatestPrice(db, thesis, cache);
  const hit = direction === "above" ? price >= target : price <= target;
  if (!hit) {
    if (rule.lastState !== "inside") await updateRuleState(db, rule.id, rule.userId, "inside");
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

async function loadPeBandCached(
  db: KanonDb,
  ticker: string,
  day: string,
  fallbackPrice: number | null,
  cache: EvalTickCache,
) {
  const key = ticker.trim().toUpperCase();
  if (cache.bandByTicker.has(key)) return cache.bandByTicker.get(key) ?? null;
  const sec = await resolveSecurityCached(db, key, cache);
  const band = sec ? await loadPeBandForSecurity(db, sec.id, day, fallbackPrice) : null;
  cache.bandByTicker.set(key, band);
  return band;
}

async function evalPeBandBreachRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  thesis: typeof thesesTable.$inferSelect,
  day: string,
  now: Date,
  cache: EvalTickCache,
): Promise<boolean> {
  const band = await loadPeBandCached(db, thesis.ticker, day, thesis.currentPrice, cache);
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

async function loadThesisCached(db: KanonDb, thesisId: string, cache: EvalTickCache) {
  if (cache.thesisById.has(thesisId)) return cache.thesisById.get(thesisId) ?? null;
  const [thesis] = await db.select().from(thesesTable).where(eq(thesesTable.id, thesisId)).limit(1);
  cache.thesisById.set(thesisId, thesis ?? null);
  return thesis ?? null;
}

async function evaluateSingleRule(
  db: KanonDb,
  rule: typeof alertRulesTable.$inferSelect,
  day: string,
  now: Date,
  cache: EvalTickCache,
): Promise<boolean> {
  if (rule.kind === "forecast_due") return evalForecastDueRule(db, rule, day, now);
  if (!rule.thesisId) return false;
  if (!(await assertThesisAccess(db, rule.thesisId, rule.userId, "read"))) return false;
  const thesis = await loadThesisCached(db, rule.thesisId, cache);
  if (!thesis) return false;
  if (rule.kind === "price_hurdle") return evalPriceHurdleRule(db, rule, thesis, day, now, cache);
  if (rule.kind === "pe_band_breach")
    return evalPeBandBreachRule(db, rule, thesis, day, now, cache);
  if (rule.kind === "form8k_redflag") {
    return evalForm8kRule(db, rule, thesis, now, () =>
      updateRuleState(db, rule.id, rule.userId, "breach", now),
    );
  }
  return false;
}

/** Evaluates enabled alert rules in deterministic `id` order with per-ticker caching & time budget cursor. */
export async function evaluateAlertRules(
  db: KanonDb,
  nowOrOptions: Date | AlertEvalOptions = new Date(),
): Promise<AlertEvalSummary> {
  const opts: AlertEvalOptions =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  const now = opts.now ?? new Date();
  const day = now.toISOString().slice(0, 10) || todayIsoUtc();
  const startedAt = performance.now();
  const conds = [eq(alertRulesTable.enabled, true)];
  if (opts.afterRuleId) conds.push(gt(alertRulesTable.id, opts.afterRuleId));
  const rules = await db
    .select()
    .from(alertRulesTable)
    .where(and(...conds))
    .orderBy(asc(alertRulesTable.id));
  const cache: EvalTickCache = {
    securityByTicker: new Map(),
    priceByTicker: new Map(),
    bandByTicker: new Map(),
    thesisById: new Map(),
  };
  let evaluatedRules = 0;
  let triggeredCount = 0;
  let lastRuleId: string | null = opts.afterRuleId ?? null;
  for (const rule of rules) {
    if (
      opts.budgetMs !== undefined &&
      evaluatedRules > 0 &&
      performance.now() - startedAt >= opts.budgetMs
    ) {
      return { evaluatedRules, triggeredCount, completed: false, nextCursor: lastRuleId };
    }
    if (await evaluateSingleRule(db, rule, day, now, cache)) triggeredCount += 1;
    evaluatedRules += 1;
    lastRuleId = rule.id;
  }
  return { evaluatedRules, triggeredCount, completed: true, nextCursor: null };
}
