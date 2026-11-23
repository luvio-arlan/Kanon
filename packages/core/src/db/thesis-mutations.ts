import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { roundTo } from "../math/valuation-scenarios";
import {
  type CreateThesisInput,
  CreateThesisInputSchema,
  type ThesisDetail,
  type UpdateThesisStepInput,
  UpdateThesisStepSchema,
} from "../schemas/research";
import type { KanonDb } from "./client";
import { crossChecksTable, hypothesesTable, thesesTable, valuationScenariosTable } from "./schema";
import { getThesisById } from "./thesis-queries";

function buildStarterHypotheses(thesisId: string, companyName: string) {
  return [
    {
      id: `${thesisId}-h1`,
      thesisId,
      sortOrder: 0,
      title: `${companyName} 核心产品保持份额扩张与定价权`,
      metricLabel: "核心业务营收增速",
      threshold: "> 15% 同比",
      status: "watching" as const,
      note: "请在财报电话会与 10-K 分部收入中核对量价拆解。",
    },
    {
      id: `${thesisId}-h2`,
      thesisId,
      sortOrder: 1,
      title: "毛利率与自由现金流维持护城河水准",
      metricLabel: "毛利率 / FCF",
      threshold: "不低于近 3 年中枢",
      status: "watching" as const,
      note: "重点观察资本开支转化效率与竞争对手降价压力。",
    },
    {
      id: `${thesisId}-h3`,
      thesisId,
      sortOrder: 2,
      title: "管理层资本配置纪律清晰且无盲目并购",
      metricLabel: "ROIC / 回购节奏",
      threshold: "ROIC > 18%",
      status: "watching" as const,
      note: "核查 10-K 现金流量表中的回购、分红与研发投入比例。",
    },
  ];
}

function buildStarterValuation(thesisId: string, price: number) {
  const baseEps = roundTo(price / 22, 2);
  return {
    thesisId,
    bearEps: roundTo(baseEps * 0.78, 2),
    bearPe: 16,
    bearProb: 0.25,
    baseEps: roundTo(baseEps * 1.35, 2),
    basePe: 22,
    baseProb: 0.5,
    bullEps: roundTo(baseEps * 1.75, 2),
    bullPe: 26,
    bullProb: 0.25,
    priceHistory: [
      { label: "6M前", price: roundTo(price * 0.88, 2) },
      { label: "4M前", price: roundTo(price * 0.94, 2) },
      { label: "2M前", price: roundTo(price * 0.97, 2) },
      { label: "现价", price: roundTo(price, 2) },
    ],
  };
}

export async function createThesis(
  db: KanonDb,
  rawInput: CreateThesisInput,
): Promise<ThesisDetail> {
  const parsed = CreateThesisInputSchema.parse(rawInput);
  const existing = await db.select({ indexOrder: thesesTable.indexOrder }).from(thesesTable);
  const nextOrder = existing.reduce((max, row) => Math.max(max, row.indexOrder), 0) + 1;
  const slug = parsed.ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = `thesis-${slug}-${crypto.randomUUID().slice(0, 6)}`;

  await db.insert(thesesTable).values({
    id,
    indexOrder: nextOrder,
    ticker: parsed.ticker,
    companyName: parsed.companyName,
    sectorTag: parsed.sectorTag,
    currentPrice: parsed.currentPrice,
    horizonYears: 3,
    convictionSummary:
      parsed.convictionSummary ??
      `待完善 ${parsed.companyName}（${parsed.ticker}）的核心护城河与 3 年盈利驱动逻辑。`,
    status: "active",
    businessFilter: {
      recurringRevenue: "watch",
      pricingPower: "watch",
      capitalReturn: "watch",
      governance: "watch",
      notes: "",
      vetoReason: "",
    },
    lastReviewedLabel: "刚刚创建 · 待初筛",
  });

  await db.insert(hypothesesTable).values(buildStarterHypotheses(id, parsed.companyName));
  await db.insert(valuationScenariosTable).values(buildStarterValuation(id, parsed.currentPrice));

  const created = await getThesisById(db, id);
  if (!created) {
    throw new Error(`Failed to hydrate newly created thesis "${id}".`);
  }
  return created;
}

async function saveValuationStep(
  db: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "valuation" }>,
  now: Date,
): Promise<void> {
  const input = parsed.valuationInput;
  const horizonYears = Math.round(input.horizonYears ?? 3);
  await db
    .update(thesesTable)
    .set({
      currentPrice: input.currentPrice,
      horizonYears,
      lastReviewedLabel: "刚刚更新 · 三情景赔率",
      updatedAt: now,
    })
    .where(eq(thesesTable.id, thesisId));

  const [existing] = await db
    .select()
    .from(valuationScenariosTable)
    .where(eq(valuationScenariosTable.thesisId, thesisId));

  const nextHistory = parsed.priceHistory ??
    existing?.priceHistory.map((pt, idx, arr) =>
      idx === arr.length - 1 ? { ...pt, price: input.currentPrice } : pt,
    ) ?? [
      { label: "起点", price: roundTo(input.currentPrice * 0.92, 2) },
      { label: "现价", price: input.currentPrice },
    ];

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
    priceHistory: nextHistory,
  };

  await db
    .insert(valuationScenariosTable)
    .values({ thesisId, ...payload })
    .onConflictDoUpdate({ target: valuationScenariosTable.thesisId, set: payload });
}

async function saveHypothesesStep(
  db: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "hypotheses" }>,
  now: Date,
): Promise<void> {
  await db.delete(hypothesesTable).where(eq(hypothesesTable.thesisId, thesisId));
  await db
    .insert(hypothesesTable)
    .values(parsed.hypotheses.map((h, idx) => ({ ...h, thesisId, sortOrder: idx })));
  await db
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚更新 · 核心假设", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));
}

async function saveCrossChecksStep(
  db: KanonDb,
  thesisId: string,
  parsed: Extract<UpdateThesisStepInput, { step: "cross_checks" }>,
  now: Date,
): Promise<void> {
  await db.delete(crossChecksTable).where(eq(crossChecksTable.thesisId, thesisId));
  if (parsed.crossChecks.length > 0) {
    await db
      .insert(crossChecksTable)
      .values(parsed.crossChecks.map((item) => ({ ...item, thesisId })));
  }
  await db
    .update(thesesTable)
    .set({ lastReviewedLabel: "刚刚更新 · 一阶交叉验证", updatedAt: now })
    .where(eq(thesesTable.id, thesisId));
}

export async function updateThesisStep(
  db: KanonDb,
  thesisId: string,
  rawInput: UpdateThesisStepInput,
): Promise<ThesisDetail | null> {
  const parsed = UpdateThesisStepSchema.parse(rawInput);
  const now = new Date();

  if (parsed.step === "business_filter") {
    await db
      .update(thesesTable)
      .set({
        status: parsed.status,
        convictionSummary: parsed.convictionSummary,
        businessFilter: parsed.businessFilter,
        lastReviewedLabel: "刚刚更新 · 商业模式滤镜",
        updatedAt: now,
      })
      .where(eq(thesesTable.id, thesisId));
  } else if (parsed.step === "hypotheses") {
    await saveHypothesesStep(db, thesisId, parsed, now);
  } else if (parsed.step === "cross_checks") {
    await saveCrossChecksStep(db, thesisId, parsed, now);
  } else {
    await saveValuationStep(db, thesisId, parsed, now);
  }
  return getThesisById(db, thesisId);
}
