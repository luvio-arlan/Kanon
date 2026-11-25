import { eq } from "drizzle-orm";
import { roundTo } from "../../math/valuation-scenarios";
import type { UpdateThesisStepInput } from "../../schemas/research";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  hypothesesTable,
  thesesTable,
  thesisCatalystsTable,
  valuationScenariosTable,
} from "../schema";
import { resolveAllowedLinkedIds, resolveSafeChildId } from "./thesis/thesis-lookups";

export async function writeBusinessFilterStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "business_filter" }>,
  now: Date,
): Promise<string> {
  await tx
    .update(thesesTable)
    .set({
      status: parsed.status,
      convictionSummary: parsed.convictionSummary,
      businessFilter: parsed.businessFilter,
      lastReviewedLabel: "刚刚更新 · 商业质量评估",
      updatedAt: now,
    })
    .where(eq(thesesTable.id, thesisId));
  return parsed.status === "archived_veto"
    ? "商业质量暂未通过初筛，已归档观察"
    : "更新商业质量评估与核心投资论点";
}

export async function writeHypothesesStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "hypotheses" }>,
  now: Date,
): Promise<string> {
  const existing = await tx
    .select({ id: hypothesesTable.id })
    .from(hypothesesTable)
    .where(eq(hypothesesTable.thesisId, thesisId));
  const owned = new Set(existing.map((r) => r.id));
  const used = new Set<string>();
  await tx.delete(hypothesesTable).where(eq(hypothesesTable.thesisId, thesisId));
  await tx.insert(hypothesesTable).values(
    parsed.hypotheses.map((h, idx) => ({
      ...h,
      id: resolveSafeChildId(h.id, thesisId, "h", owned, used),
      kpiRule: h.kpiRule ?? null,
      thesisId,
      sortOrder: idx,
    })),
  );
  await tx
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚更新 · 核心假设", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));
  const validated = parsed.hypotheses.filter((h) => h.status === "validated").length;
  return `更新 ${parsed.hypotheses.length} 条可证伪核心假设（已验证 ${validated}/${parsed.hypotheses.length}）`;
}

export async function writeCatalystsStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "catalysts" }>,
  now: Date,
): Promise<string> {
  const existing = await tx
    .select({ id: thesisCatalystsTable.id })
    .from(thesisCatalystsTable)
    .where(eq(thesisCatalystsTable.thesisId, thesisId));
  const owned = new Set(existing.map((r) => r.id));
  const used = new Set<string>();
  await tx.delete(thesisCatalystsTable).where(eq(thesisCatalystsTable.thesisId, thesisId));
  if (parsed.catalysts.length > 0) {
    await tx.insert(thesisCatalystsTable).values(
      parsed.catalysts.map((item) => ({
        ...item,
        id: resolveSafeChildId(item.id, thesisId, "cat", owned, used),
        thesisId,
      })),
    );
  }
  await tx
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚更新 · 催化剂日程", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));
  const upcoming = parsed.catalysts.filter((c) => c.status === "upcoming").length;
  return `更新催化剂日程（待验证 ${upcoming}/${parsed.catalysts.length} 项）`;
}

export async function writeCrossChecksStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "cross_checks" }>,
  now: Date,
  userId?: string,
): Promise<string> {
  const [existing, allowedLinks] = await Promise.all([
    tx
      .select({ id: crossChecksTable.id })
      .from(crossChecksTable)
      .where(eq(crossChecksTable.thesisId, thesisId)),
    resolveAllowedLinkedIds(tx, userId, parsed.crossChecks),
  ]);
  const owned = new Set(existing.map((r) => r.id));
  const used = new Set<string>();
  await tx.delete(crossChecksTable).where(eq(crossChecksTable.thesisId, thesisId));
  if (parsed.crossChecks.length > 0) {
    await tx.insert(crossChecksTable).values(
      parsed.crossChecks.map((item) => ({
        ...item,
        id: resolveSafeChildId(item.id, thesisId, "cc", owned, used),
        thesisId,
        linkedThesisId:
          item.linkedThesisId && (!allowedLinks || allowedLinks.has(item.linkedThesisId))
            ? item.linkedThesisId
            : null,
        hypothesisId: item.hypothesisId ?? null,
      })),
    );
  }
  await tx
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚更新 · 一阶交叉验证", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));
  return `更新产业链一阶交叉验证（共 ${parsed.crossChecks.length} 条记录）`;
}

function resolveValuationHistory(
  provided: Extract<UpdateThesisStepInput, { step: "valuation" }>["priceHistory"],
  existing: Array<{ label: string; price: number }> | undefined,
  currentPrice: number,
) {
  if (provided) return provided;
  if (existing) {
    return existing.map((pt, idx, arr) =>
      idx === arr.length - 1 ? { ...pt, price: currentPrice } : pt,
    );
  }
  return [
    { label: "起点", price: roundTo(currentPrice * 0.92, 2) },
    { label: "现价", price: currentPrice },
  ];
}

export async function writeValuationStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "valuation" }>,
  now: Date,
): Promise<string> {
  const input = parsed.valuationInput;
  const horizonYears = Math.round(input.horizonYears ?? 3);
  await tx
    .update(thesesTable)
    .set({
      currentPrice: input.currentPrice,
      horizonYears,
      lastReviewedLabel: "刚刚更新 · 三情景赔率",
      updatedAt: now,
    })
    .where(eq(thesesTable.id, thesisId));
  const [existing] = await tx
    .select()
    .from(valuationScenariosTable)
    .where(eq(valuationScenariosTable.thesisId, thesisId));
  const payload = {
    bearEps: input.bear.eps,
    bearPe: input.bear.peMultiple,
    bearProb: input.bear.probability ?? 0.25,
    baseEps: input.base.eps,
    basePe: input.base.peMultiple,
    baseProb: input.base.probability ?? 0.5,
    bullEps: input.bull.eps,
    bullPe: input.bull.peMultiple,
    bullProb: input.bull.probability ?? 0.25,
    modelMode: parsed.modelMode ?? existing?.modelMode ?? "pe",
    driverInputs:
      parsed.driverInputs !== undefined ? parsed.driverInputs : (existing?.driverInputs ?? null),
    priceHistory: resolveValuationHistory(
      parsed.priceHistory,
      existing?.priceHistory,
      input.currentPrice,
    ),
  };
  await tx
    .insert(valuationScenariosTable)
    .values({ thesisId, ...payload })
    .onConflictDoUpdate({ target: valuationScenariosTable.thesisId, set: payload });
  return `校准 ${horizonYears} 年三情景估值模型（中性 EPS $${input.base.eps} × ${input.base.peMultiple}x）`;
}

export async function writePriceAnchorStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "price_anchor" }>,
  now: Date,
): Promise<string> {
  const price = roundTo(parsed.currentPrice, 2);
  await tx
    .update(thesesTable)
    .set({ currentPrice: price, lastReviewedLabel: "刚刚校准 · 现价锚点", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));

  const [existing] = await tx
    .select()
    .from(valuationScenariosTable)
    .where(eq(valuationScenariosTable.thesisId, thesisId));

  if (existing) {
    const label = parsed.label ?? "现价";
    const updatedHistory = existing.priceHistory.map((pt, idx, arr) =>
      idx === arr.length - 1 ? { label, price } : pt,
    );
    await tx
      .update(valuationScenariosTable)
      .set({ priceHistory: updatedHistory })
      .where(eq(valuationScenariosTable.thesisId, thesisId));
  }
  return `快速校准当前参考价至 $${price.toFixed(2)}`;
}

export async function writePortfolioStep(
  tx: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "portfolio" }>,
  now: Date,
): Promise<string> {
  await tx
    .update(thesesTable)
    .set({
      portfolioRole: parsed.portfolioRole,
      currentWeightPct: parsed.currentWeightPct,
      targetMaxWeightPct: parsed.targetMaxWeightPct,
      avgCostBasis: parsed.avgCostBasis,
      lastReviewedLabel: "刚刚更新 · 组合仓位",
      updatedAt: now,
    })
    .where(eq(thesesTable.id, thesisId));
  return `更新仓位角色为 ${parsed.portfolioRole}（当前 ${parsed.currentWeightPct}% / 上限 ${parsed.targetMaxWeightPct}%）`;
}
