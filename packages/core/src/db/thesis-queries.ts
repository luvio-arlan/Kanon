import { asc, desc, eq } from "drizzle-orm";
import { calculateValuationScenarios } from "../math/valuation-scenarios";
import type {
  CrossCheck,
  DisciplineEntry,
  GlossaryTerm,
  SecSnapshot,
  ThesisDetail,
} from "../schemas/research";
import type { Hypothesis } from "../schemas/thesis";
import type { KanonDb } from "./client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  glossaryTermsTable,
  hypothesesTable,
  secFilingsCacheTable,
  thesesTable,
  valuationScenariosTable,
} from "./schema";

type ThesisRow = typeof thesesTable.$inferSelect;
type HypothesisRow = typeof hypothesesTable.$inferSelect;
type CrossCheckRow = typeof crossChecksTable.$inferSelect;
type ValuationRow = typeof valuationScenariosTable.$inferSelect;
type DisciplineRow = typeof disciplineEntriesTable.$inferSelect;

function toHypothesisTuple(rows: HypothesisRow[]): [Hypothesis, Hypothesis, Hypothesis] {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const fallback = (idx: number): Hypothesis => ({
    id: `placeholder-h-${idx}`,
    title: "待补充核心可证伪假设",
    metricLabel: "核心观测指标",
    threshold: "待设定红线",
    status: "watching",
    note: "请在 Step 2 补充量化观测口径与证伪条件。",
  });
  return [sorted[0] ?? fallback(1), sorted[1] ?? fallback(2), sorted[2] ?? fallback(3)];
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
    convictionSummary: row.convictionSummary,
    status: row.status,
    businessFilter: row.businessFilter,
    hypotheses: toHypothesisTuple(hypotheses),
    crossChecks: formattedChecks,
    valuationInput: valInput,
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

  return rows.map((row) =>
    hydrateThesis({
      row,
      hypotheses: allHypotheses.filter((h) => h.thesisId === row.id),
      crossChecks: allChecks.filter((c) => c.thesisId === row.id),
      valuationRow: allVals.find((v) => v.thesisId === row.id),
      disciplineRows: allDiscipline.filter((d) => d.thesisId === row.id),
    }),
  );
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

  return hydrateThesis({
    row,
    hypotheses,
    crossChecks,
    valuationRow: vals[0],
    disciplineRows,
  });
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
  };
}
