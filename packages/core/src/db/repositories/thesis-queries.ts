import { asc, desc, eq } from "drizzle-orm";
import { calculateValuationScenarios } from "../../math/valuation-scenarios";
import type {
  BusinessFilter,
  CrossCheck,
  DisciplineEntry,
  GlossaryTerm,
  SecSnapshot,
  ThesisDetail,
  ThesisSummary,
} from "../../schemas/research";
import type { Hypothesis } from "../../schemas/thesis";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  glossaryTermsTable,
  hypothesesTable,
  secFilingsCacheTable,
  thesesTable,
  valuationScenariosTable,
} from "../schema";

type ThesisRow = typeof thesesTable.$inferSelect;
type HypothesisRow = typeof hypothesesTable.$inferSelect;
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

function normalizeHypotheses(rows: HypothesisRow[]): Hypothesis[] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const fallback = (idx: number): Hypothesis => ({
    id: `placeholder-h-${idx}`,
    title: "待补充核心可证伪假设",
    metricLabel: "核心观测指标",
    threshold: "待设定红线",
    status: "watching",
    note: "请在 Step 2 补充量化观测口径与证伪条件。",
  });
  const result = sorted.slice(0, 5).map(({ thesisId: _, sortOrder: __, ...rest }) => rest);
  while (result.length < 3) {
    result.push(fallback(result.length + 1));
  }
  return result;
}

function buildValuationInput(row: ThesisRow, valuationRow: ValuationRow | undefined) {
  return {
    currentPrice: row.currentPrice,
    horizonYears: row.horizonYears,
    bear: {
      eps: valuationRow?.bearEps ?? 1,
      peMultiple: valuationRow?.bearPe ?? 15,
      probability: valuationRow?.bearProb ?? 0.25,
    },
    base: {
      eps: valuationRow?.baseEps ?? 2,
      peMultiple: valuationRow?.basePe ?? 20,
      probability: valuationRow?.baseProb ?? 0.5,
    },
    bull: {
      eps: valuationRow?.bullEps ?? 3,
      peMultiple: valuationRow?.bullPe ?? 25,
      probability: valuationRow?.bullProb ?? 0.25,
    },
  };
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

function hydrateThesis(params: {
  row: ThesisRow;
  hypotheses: HypothesisRow[];
  crossChecks: CrossCheckRow[];
  valuationRow: ValuationRow | undefined;
  disciplineRows: DisciplineRow[];
}): ThesisDetail {
  const { row, hypotheses, crossChecks, valuationRow, disciplineRows } = params;
  const valInput = buildValuationInput(row, valuationRow);
  const formattedChecks: CrossCheck[] = crossChecks.map(
    ({ thesisId: _, createdAt: __, ...rest }) => rest,
  );
  const formattedDiscipline: DisciplineEntry[] = disciplineRows.map(
    ({ thesisId: _, createdAt, ...rest }) => ({ ...rest, createdAt: createdAt.toISOString() }),
  );
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
    hypotheses: normalizeHypotheses(hypotheses),
    crossChecks: formattedChecks,
    valuationInput: valInput,
    valuationModelMode: valuationRow?.modelMode ?? "pe",
    valuationDriverInputs: valuationRow?.driverInputs ?? null,
    valuation: calculateValuationScenarios(valInput),
    priceHistory: valuationRow?.priceHistory ?? [
      { label: "起点", price: row.currentPrice * 0.92 },
      { label: "现价", price: row.currentPrice },
    ],
    disciplineEntries: formattedDiscipline,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTheses(db: KanonDb): Promise<ThesisDetail[]> {
  const [rows, allHypotheses, allChecks, allVals, allDiscipline] = await Promise.all([
    db.select().from(thesesTable).orderBy(asc(thesesTable.indexOrder)),
    db.select().from(hypothesesTable).orderBy(asc(hypothesesTable.sortOrder)),
    db.select().from(crossChecksTable).orderBy(asc(crossChecksTable.createdAt)),
    db.select().from(valuationScenariosTable),
    db.select().from(disciplineEntriesTable).orderBy(desc(disciplineEntriesTable.createdAt)),
  ]);
  const hypMap = groupByThesisId(allHypotheses);
  const checkMap = groupByThesisId(allChecks);
  const discMap = groupByThesisId(allDiscipline);
  const valMap = new Map(allVals.map((v) => [v.thesisId, v]));

  return rows.map((row) =>
    hydrateThesis({
      row,
      hypotheses: hypMap.get(row.id) ?? [],
      crossChecks: checkMap.get(row.id) ?? [],
      valuationRow: valMap.get(row.id),
      disciplineRows: discMap.get(row.id) ?? [],
    }),
  );
}

export async function listThesisSummaries(db: KanonDb): Promise<ThesisSummary[]> {
  const [rows, vals] = await Promise.all([
    db.select().from(thesesTable).orderBy(asc(thesesTable.indexOrder)),
    db.select().from(valuationScenariosTable),
  ]);
  const valMap = new Map(vals.map((v) => [v.thesisId, v]));

  return rows.map((row) => {
    const val = calculateValuationScenarios(buildValuationInput(row, valMap.get(row.id)));
    return {
      id: row.id,
      indexLabel: String(row.indexOrder).padStart(2, "0"),
      ticker: row.ticker,
      companyName: row.companyName,
      sectorTag: row.sectorTag,
      status: row.status,
      baseTargetPrice: val.base.targetPrice,
      riskRewardRatio: val.riskRewardRatio,
    };
  });
}

export async function getThesisById(db: KanonDb, id: string): Promise<ThesisDetail | null> {
  const [row] = await db.select().from(thesesTable).where(eq(thesesTable.id, id));
  if (!row) return null;

  const [hypotheses, crossChecks, vals, disciplineRows] = await Promise.all([
    db
      .select()
      .from(hypothesesTable)
      .where(eq(hypothesesTable.thesisId, id))
      .orderBy(asc(hypothesesTable.sortOrder)),
    db
      .select()
      .from(crossChecksTable)
      .where(eq(crossChecksTable.thesisId, id))
      .orderBy(asc(crossChecksTable.createdAt)),
    db.select().from(valuationScenariosTable).where(eq(valuationScenariosTable.thesisId, id)),
    db
      .select()
      .from(disciplineEntriesTable)
      .where(eq(disciplineEntriesTable.thesisId, id))
      .orderBy(desc(disciplineEntriesTable.createdAt)),
  ]);

  return hydrateThesis({ row, hypotheses, crossChecks, valuationRow: vals[0], disciplineRows });
}

export async function listGlossaryTerms(db: KanonDb): Promise<GlossaryTerm[]> {
  return db.select().from(glossaryTermsTable).orderBy(asc(glossaryTermsTable.term));
}

export async function getSecSnapshot(db: KanonDb, ticker: string): Promise<SecSnapshot | null> {
  const normalized = ticker.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(secFilingsCacheTable)
    .where(eq(secFilingsCacheTable.ticker, normalized));
  if (!row) return null;
  return {
    ticker: row.ticker,
    cik: row.cik,
    entityName: row.entityName,
    source: row.source,
    fetchedAt: row.fetchedAt.toISOString(),
    filings: row.filings,
    facts: row.facts,
    annuals: row.annuals ?? [],
    quarterlies: row.quarterlies ?? [],
  };
}
