import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { DEFAULT_WORKSPACE_USER_ID } from "../../contracts/auth-contracts";
import {
  calculateValuationScenarios,
  clampDisplayValuationInput,
  sanitizeValuationInput,
} from "../../math/valuation-scenarios";
import type {
  BusinessFilter,
  CrossCheck,
  DisciplineEntry,
  ThesisCatalyst,
  ThesisDetail,
} from "../../schemas/research";
import type { Hypothesis } from "../../schemas/thesis";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  thesesTable,
  thesisCatalystsTable,
  valuationScenariosTable,
} from "../schema";
import { listUserOrgIds } from "./enterprise/organizations-and-rls-store";

type ThesisRow = typeof thesesTable.$inferSelect;
type HypothesisRow = typeof hypothesesTable.$inferSelect;
type CatalystRow = typeof thesisCatalystsTable.$inferSelect;
type CrossCheckRow = typeof crossChecksTable.$inferSelect;
type ValuationRow = typeof valuationScenariosTable.$inferSelect;
type DisciplineRow = typeof disciplineEntriesTable.$inferSelect;

function normalizeFilter(raw: BusinessFilter): BusinessFilter {
  return {
    ...raw,
    consensusView: raw.consensusView ?? "",
    variantPerception: raw.variantPerception ?? "",
    keyDebate: raw.keyDebate ?? "",
    preMortem: raw.preMortem ?? "",
  };
}

function normalizeHypotheses(thesisId: string, rows: HypothesisRow[]): Hypothesis[] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const result: Hypothesis[] = sorted
    .slice(0, 5)
    .map(({ thesisId: _, sortOrder: __, ...rest }) => rest);
  while (result.length < 3) {
    result.push({
      id: `${thesisId}-placeholder-h-${result.length + 1}`,
      title: "待补充核心可证伪假设",
      metricLabel: "核心观测指标",
      threshold: "待设定红线",
      status: "watching",
      note: "请在 Step 2 补充量化观测口径与证伪条件。",
    });
  }
  return result;
}

function mkCase(
  eps: number | undefined,
  pe: number | undefined,
  prob: number | undefined,
  d: [number, number, number],
) {
  return { eps: eps ?? d[0], peMultiple: pe ?? d[1], probability: prob ?? d[2] };
}

export function buildValuationInput(row: ThesisRow, val: ValuationRow | undefined) {
  const raw = {
    currentPrice: row.currentPrice,
    horizonYears: row.horizonYears,
    bear: mkCase(val?.bearEps, val?.bearPe, val?.bearProb, [0, 0, 0.25]),
    base: mkCase(val?.baseEps, val?.basePe, val?.baseProb, [0, 0, 0.5]),
    bull: mkCase(val?.bullEps, val?.bullPe, val?.bullProb, [0, 0, 0.25]),
  };
  const checked = sanitizeValuationInput(raw);
  if (checked.ok) {
    return { input: checked.input, issues: undefined };
  }
  return { input: clampDisplayValuationInput(raw), issues: checked.issues };
}

function groupByThesisId<T extends { thesisId: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.thesisId);
    if (bucket) bucket.push(row);
    else map.set(row.thesisId, [row]);
  }
  return map;
}

export function hydrateThesis(params: {
  row: ThesisRow;
  hypotheses: HypothesisRow[];
  catalysts?: CatalystRow[];
  crossChecks: CrossCheckRow[];
  valuationRow: ValuationRow | undefined;
  disciplineRows: DisciplineRow[];
}): ThesisDetail {
  const { row, hypotheses, catalysts = [], crossChecks, valuationRow, disciplineRows } = params;
  const { input: valInput, issues: valuationInputIssues } = buildValuationInput(row, valuationRow);
  return {
    id: row.id,
    indexLabel: String(row.indexOrder).padStart(2, "0"),
    ticker: row.ticker,
    companyName: row.companyName,
    sectorTag: row.sectorTag,
    currentPrice: row.currentPrice,
    lastReviewedAt: row.lastReviewedLabel,
    horizonLabel: `${row.horizonYears} 年周期`,
    horizonYears: row.horizonYears,
    portfolioRole: row.portfolioRole ?? "watchlist",
    currentWeightPct: row.currentWeightPct ?? 0,
    targetMaxWeightPct: row.targetMaxWeightPct ?? 15,
    avgCostBasis: row.avgCostBasis ?? null,
    convictionSummary: row.convictionSummary,
    status: row.status,
    businessFilter: normalizeFilter(row.businessFilter),
    hypotheses: normalizeHypotheses(row.id, hypotheses),
    catalysts: catalysts.map(({ thesisId: _, createdAt: __, ...rest }): ThesisCatalyst => rest),
    crossChecks: crossChecks.map(({ thesisId: _, createdAt: __, ...rest }): CrossCheck => rest),
    valuationInput: valInput,
    ...(valuationInputIssues ? { valuationInputIssues } : {}),
    valuationModelMode: valuationRow?.modelMode ?? "pe",
    valuationDriverInputs: valuationRow?.driverInputs ?? null,
    valuation: calculateValuationScenarios(valInput),
    priceHistory: valuationRow?.priceHistory ?? [
      { label: "起点", price: row.currentPrice * 0.92 },
      { label: "现价", price: row.currentPrice },
    ],
    disciplineEntries: disciplineRows.map(
      ({ thesisId: _, createdAt, ...rest }): DisciplineEntry => ({
        ...rest,
        createdAt: createdAt.toISOString(),
      }),
    ),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function loadThesisChildren(db: KanonDb, thesisIds: readonly string[]) {
  const ids = [...thesisIds];
  const [hyps, cats, checks, vals, disc] = await Promise.all([
    db
      .select()
      .from(hypothesesTable)
      .where(inArray(hypothesesTable.thesisId, ids))
      .orderBy(asc(hypothesesTable.sortOrder)),
    db
      .select()
      .from(thesisCatalystsTable)
      .where(inArray(thesisCatalystsTable.thesisId, ids))
      .orderBy(asc(thesisCatalystsTable.createdAt)),
    db
      .select()
      .from(crossChecksTable)
      .where(inArray(crossChecksTable.thesisId, ids))
      .orderBy(asc(crossChecksTable.createdAt)),
    db.select().from(valuationScenariosTable).where(inArray(valuationScenariosTable.thesisId, ids)),
    db
      .select()
      .from(disciplineEntriesTable)
      .where(inArray(disciplineEntriesTable.thesisId, ids))
      .orderBy(desc(disciplineEntriesTable.createdAt)),
  ]);
  return {
    hypMap: groupByThesisId(hyps),
    catMap: groupByThesisId(cats),
    checkMap: groupByThesisId(checks),
    discMap: groupByThesisId(disc),
    valMap: new Map(vals.map((v) => [v.thesisId, v])),
  };
}

export function hydrateWithChildren(
  row: ThesisRow,
  children: Awaited<ReturnType<typeof loadThesisChildren>>,
): ThesisDetail {
  return hydrateThesis({
    row,
    hypotheses: children.hypMap.get(row.id) ?? [],
    catalysts: children.catMap.get(row.id) ?? [],
    crossChecks: children.checkMap.get(row.id) ?? [],
    valuationRow: children.valMap.get(row.id),
    disciplineRows: children.discMap.get(row.id) ?? [],
  });
}

export async function listTheses(
  db: KanonDb,
  userId: string = DEFAULT_WORKSPACE_USER_ID,
): Promise<ThesisDetail[]> {
  const orgIds = await listUserOrgIds(db, userId);
  const accessWhere =
    orgIds.length > 0
      ? or(eq(thesesTable.userId, userId), inArray(thesesTable.orgId, orgIds))
      : eq(thesesTable.userId, userId);
  const rows = await db
    .select()
    .from(thesesTable)
    .where(accessWhere)
    .orderBy(asc(thesesTable.indexOrder));
  if (rows.length === 0) return [];
  const children = await loadThesisChildren(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => hydrateWithChildren(row, children));
}

export async function getThesisById(
  db: KanonDb,
  id: string,
  userId?: string,
): Promise<ThesisDetail | null> {
  let where = eq(thesesTable.id, id);
  if (userId) {
    const orgIds = await listUserOrgIds(db, userId);
    const access =
      orgIds.length > 0
        ? or(eq(thesesTable.userId, userId), inArray(thesesTable.orgId, orgIds))
        : eq(thesesTable.userId, userId);
    where = and(eq(thesesTable.id, id), access) ?? eq(thesesTable.id, id);
  }
  const [row] = await db.select().from(thesesTable).where(where).limit(1);
  if (!row) return null;
  const children = await loadThesisChildren(db, [row.id]);
  return hydrateWithChildren(row, children);
}
