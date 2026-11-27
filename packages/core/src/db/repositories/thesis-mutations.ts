import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { DEFAULT_WORKSPACE_USER_ID } from "../../contracts/auth-contracts";
import { roundTo } from "../../math/valuation-scenarios";
import {
  type CreateThesisInput,
  CreateThesisInputSchema,
  type ThesisDetail,
  type ThesisRevision,
  type UpdateThesisStepInput,
  UpdateThesisStepSchema,
} from "../../schemas/research";
import { type KanonDb, runInTransaction } from "../client";
import { hypothesesTable, thesesTable, valuationScenariosTable } from "../schema";
import { listThesisRevisions, recordThesisRevision } from "./revision-queries";
import { buildThesisWriteAccessWhere } from "./thesis/thesis-access";
import { getThesisById } from "./thesis-queries";
import {
  writeBusinessFilterStep,
  writeCatalystsStep,
  writeCrossChecksStep,
  writeHypothesesStep,
  writePortfolioStep,
  writePriceAnchorStep,
  writeValuationStep,
} from "./thesis-step-writers";

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

function buildStarterValuation(
  thesisId: string,
  price: number,
  latestSecEps?: number,
  priceHistory?: ReadonlyArray<{ label: string; price: number }>,
) {
  const trailingEps = latestSecEps && latestSecEps > 0 ? latestSecEps : roundTo(price / 22, 2);
  const rawPe = Math.min(35, Math.max(12, Math.round(price / trailingEps)));
  const basePe = Math.min(32, Math.max(14, rawPe));
  return {
    thesisId,
    bearEps: roundTo(Math.max(0.05, trailingEps * 0.9), 2),
    bearPe: Math.max(10, basePe - 5),
    bearProb: 0.25,
    baseEps: roundTo(Math.max(0.08, trailingEps * 1.38), 2),
    basePe,
    baseProb: 0.5,
    bullEps: roundTo(Math.max(0.12, trailingEps * 1.8), 2),
    bullPe: Math.min(42, basePe + 5),
    bullProb: 0.25,
    priceHistory:
      priceHistory && priceHistory.length >= 2
        ? [...priceHistory]
        : [
            { label: "6M前", price: roundTo(price * 0.88, 2) },
            { label: "4M前", price: roundTo(price * 0.94, 2) },
            { label: "2M前", price: roundTo(price * 0.97, 2) },
            { label: "现价", price: roundTo(price, 2) },
          ],
  };
}

function buildNewThesisRow(
  id: string,
  userId: string,
  indexOrder: number,
  parsed: ReturnType<typeof CreateThesisInputSchema.parse>,
) {
  return {
    id,
    userId,
    indexOrder,
    ticker: parsed.ticker,
    companyName: parsed.companyName,
    sectorTag: parsed.sectorTag,
    currentPrice: parsed.currentPrice,
    horizonYears: 3,
    convictionSummary:
      parsed.convictionSummary ??
      `待完善 ${parsed.companyName}（${parsed.ticker}）的核心护城河与 3 年盈利驱动逻辑。`,
    status: "active" as const,
    businessFilter: {
      recurringRevenue: "watch" as const,
      pricingPower: "watch" as const,
      capitalReturn: "watch" as const,
      governance: "watch" as const,
      notes: "",
      vetoReason: "",
      consensusView: "",
      variantPerception: "",
      keyDebate: "",
      preMortem: "",
    },
    lastReviewedLabel: "刚刚创建 · 待初筛",
  };
}

export async function createThesis(
  db: KanonDb,
  rawInput: CreateThesisInput,
  userId: string = DEFAULT_WORKSPACE_USER_ID,
): Promise<ThesisDetail> {
  const parsed = CreateThesisInputSchema.parse(rawInput);
  const slug = parsed.ticker.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = `thesis-${slug}-${crypto.randomUUID().slice(0, 6)}`;

  return runInTransaction(db, async (tx) => {
    const existing = await tx
      .select({ indexOrder: thesesTable.indexOrder })
      .from(thesesTable)
      .where(eq(thesesTable.userId, userId));
    const nextOrder = existing.reduce((max, row) => Math.max(max, row.indexOrder), 0) + 1;

    await tx.insert(thesesTable).values(buildNewThesisRow(id, userId, nextOrder, parsed));
    await tx.insert(hypothesesTable).values(buildStarterHypotheses(id, parsed.companyName));
    await tx
      .insert(valuationScenariosTable)
      .values(
        buildStarterValuation(id, parsed.currentPrice, parsed.latestSecEps, parsed.priceHistory),
      );

    const created = await getThesisById(tx, id, userId);
    if (!created) {
      throw new Error(`Failed to hydrate newly created thesis "${id}".`);
    }
    await recordThesisRevision(
      tx,
      created,
      "create",
      `建档 ${created.companyName}（${created.ticker}），初始参考价 $${created.currentPrice.toFixed(2)}`,
    );
    return created;
  });
}

async function dispatchStepWrite(
  tx: KanonDb,
  thesisId: string,
  parsed: UpdateThesisStepInput,
  now: Date,
  userId?: string,
): Promise<string> {
  if (parsed.step === "business_filter") return writeBusinessFilterStep(tx, thesisId, parsed, now);
  if (parsed.step === "hypotheses") return writeHypothesesStep(tx, thesisId, parsed, now);
  if (parsed.step === "catalysts") return writeCatalystsStep(tx, thesisId, parsed, now);
  if (parsed.step === "cross_checks") {
    return writeCrossChecksStep(tx, thesisId, parsed, now, userId);
  }
  if (parsed.step === "price_anchor") return writePriceAnchorStep(tx, thesisId, parsed, now);
  if (parsed.step === "portfolio") return writePortfolioStep(tx, thesisId, parsed, now);
  return writeValuationStep(tx, thesisId, parsed, now);
}

export type CheckedStepUpdateResult =
  | { kind: "ok"; thesis: ThesisDetail; revisions: ThesisRevision[] }
  | { kind: "not_found" }
  | { kind: "invalid_version" }
  | { kind: "conflict"; serverUpdatedAt: string };

async function verifyStepRowAccess(
  tx: KanonDb,
  thesisId: string,
  userId: string | undefined,
  expectedUpdatedAt?: string | null,
): Promise<{ ok: true } | { ok: false; result: CheckedStepUpdateResult }> {
  const whereClause = userId
    ? and(eq(thesesTable.id, thesisId), await buildThesisWriteAccessWhere(tx, userId))
    : eq(thesesTable.id, thesisId);
  const [row] = await tx
    .select({ id: thesesTable.id, updatedAt: thesesTable.updatedAt })
    .from(thesesTable)
    .where(whereClause)
    .for("update");
  if (!row) return { ok: false, result: { kind: "not_found" } };
  if (!expectedUpdatedAt) return { ok: true };
  const expectedMs = Date.parse(expectedUpdatedAt);
  if (!Number.isFinite(expectedMs)) return { ok: false, result: { kind: "invalid_version" } };
  if (Math.abs(row.updatedAt.getTime() - expectedMs) > 5) {
    return {
      ok: false,
      result: { kind: "conflict", serverUpdatedAt: row.updatedAt.toISOString() },
    };
  }
  return { ok: true };
}

export async function updateThesisStepChecked(
  db: KanonDb,
  thesisId: string,
  rawInput: UpdateThesisStepInput,
  userId?: string,
  expectedUpdatedAt?: string | null,
): Promise<CheckedStepUpdateResult> {
  const parsed = UpdateThesisStepSchema.parse(rawInput);
  const now = new Date();
  return runInTransaction(db, async (tx) => {
    const access = await verifyStepRowAccess(tx, thesisId, userId, expectedUpdatedAt);
    if (!access.ok) return access.result;
    const summary = await dispatchStepWrite(tx, thesisId, parsed, now, userId);
    const updated = await getThesisById(tx, thesisId, userId);
    if (!updated) return { kind: "not_found" };
    await recordThesisRevision(tx, updated, parsed.step, summary);
    const revisions = await listThesisRevisions(tx, thesisId);
    return { kind: "ok", thesis: updated, revisions };
  });
}

export async function updateThesisStep(
  db: KanonDb,
  thesisId: string,
  rawInput: UpdateThesisStepInput,
  userId?: string,
): Promise<ThesisDetail | null> {
  const res = await updateThesisStepChecked(db, thesisId, rawInput, userId);
  return res.kind === "ok" ? res.thesis : null;
}
