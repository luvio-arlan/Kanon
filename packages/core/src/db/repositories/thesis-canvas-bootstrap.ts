import { asc, desc, eq, inArray } from "drizzle-orm";
import type { SavedAgentRun } from "../../contracts/api-contracts";
import {
  calculateValuationScenarios,
  sanitizeValuationInput,
} from "../../math/valuation-scenarios";
import type {
  GlossaryTerm,
  InboundCrossCheck,
  QuarterlyReview,
  ResearchNote,
  SavedCopilotOutput,
  SecSnapshot,
  ThesisDetail,
  ThesisRevision,
  ThesisSummary,
} from "../../schemas/research";
import type { KanonDb } from "../client";
import {
  crossChecksTable,
  disciplineEntriesTable,
  hypothesesTable,
  thesesTable,
  thesisCatalystsTable,
  valuationScenariosTable,
} from "../schema";
import { listCopilotOutputs } from "./copilot-store";
import { getSecSnapshot, listGlossaryTerms } from "./discipline-mutations";
import { listResearchNotes } from "./library/research-notes-store";
import {
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
} from "./review-and-agent-store";
import { listThesisRevisions } from "./revision-queries";
import { hydrateThesis } from "./thesis-queries";

interface ThesisCanvasBootstrap {
  thesis: ThesisDetail;
  allTheses: ThesisSummary[];
  glossary: GlossaryTerm[];
  secSnapshot: SecSnapshot | null;
  savedOutputs: SavedCopilotOutput[];
  revisions: ThesisRevision[];
  reviews: QuarterlyReview[];
  latestAgentRun: SavedAgentRun | null;
  inboundCrossChecks: InboundCrossCheck[];
  researchNotes: ResearchNote[];
}

interface ValuationScalarRow {
  thesisId: string;
  bearEps: number;
  bearPe: number;
  bearProb: number;
  baseEps: number;
  basePe: number;
  baseProb: number;
  bullEps: number;
  bullPe: number;
  bullProb: number;
}

function buildSummaryValuationInput(
  row: typeof thesesTable.$inferSelect,
  val: ValuationScalarRow | undefined,
) {
  return sanitizeValuationInput({
    currentPrice: row.currentPrice,
    horizonYears: row.horizonYears,
    bear: {
      eps: val?.bearEps ?? 1,
      peMultiple: val?.bearPe ?? 15,
      probability: val?.bearProb ?? 0.25,
    },
    base: {
      eps: val?.baseEps ?? 2,
      peMultiple: val?.basePe ?? 20,
      probability: val?.baseProb ?? 0.5,
    },
    bull: {
      eps: val?.bullEps ?? 3,
      peMultiple: val?.bullPe ?? 25,
      probability: val?.bullProb ?? 0.25,
    },
  });
}

function buildSummaries(
  rows: readonly (typeof thesesTable.$inferSelect)[],
  valMap: Map<string, ValuationScalarRow>,
): ThesisSummary[] {
  return rows.map((row) => {
    const val = calculateValuationScenarios(buildSummaryValuationInput(row, valMap.get(row.id)));
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

function fetchInitialWave(db: KanonDb, id: string, userId: string) {
  return Promise.all([
    db
      .select()
      .from(thesesTable)
      .where(eq(thesesTable.userId, userId))
      .orderBy(asc(thesesTable.indexOrder)),
    db
      .select()
      .from(hypothesesTable)
      .where(eq(hypothesesTable.thesisId, id))
      .orderBy(asc(hypothesesTable.sortOrder)),
    db
      .select()
      .from(thesisCatalystsTable)
      .where(eq(thesisCatalystsTable.thesisId, id))
      .orderBy(asc(thesisCatalystsTable.createdAt)),
    db
      .select()
      .from(crossChecksTable)
      .where(eq(crossChecksTable.thesisId, id))
      .orderBy(asc(crossChecksTable.createdAt)),
    db
      .select()
      .from(disciplineEntriesTable)
      .where(eq(disciplineEntriesTable.thesisId, id))
      .orderBy(desc(disciplineEntriesTable.createdAt)),
    listGlossaryTerms(db),
    listCopilotOutputs(db, id),
    listThesisRevisions(db, id, 12),
    listQuarterlyReviews(db, id),
    getLatestAgentRun(db, id),
    listInboundCrossChecks(db, id, userId),
    listResearchNotes(db, id, userId),
  ]);
}

function loadTargetAndSiblingValuations(
  db: KanonDb,
  id: string,
  ticker: string,
  allIds: readonly string[],
) {
  return Promise.all([
    getSecSnapshot(db, ticker),
    db
      .select()
      .from(valuationScenariosTable)
      .where(eq(valuationScenariosTable.thesisId, id))
      .limit(1),
    db
      .select({
        thesisId: valuationScenariosTable.thesisId,
        bearEps: valuationScenariosTable.bearEps,
        bearPe: valuationScenariosTable.bearPe,
        bearProb: valuationScenariosTable.bearProb,
        baseEps: valuationScenariosTable.baseEps,
        basePe: valuationScenariosTable.basePe,
        baseProb: valuationScenariosTable.baseProb,
        bullEps: valuationScenariosTable.bullEps,
        bullPe: valuationScenariosTable.bullPe,
        bullProb: valuationScenariosTable.bullProb,
      })
      .from(valuationScenariosTable)
      .where(inArray(valuationScenariosTable.thesisId, [...allIds])),
  ]);
}

export async function loadThesisCanvasBootstrap(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<ThesisCanvasBootstrap | null> {
  const wave = await fetchInitialWave(db, id, userId);
  const [rows, hypotheses, catalysts, crossChecks, disciplineRows, glossary, savedOutputs] = wave;
  const [, , , , , , , revisions, reviews, latestAgentRun, inboundCrossChecks, researchNotes] =
    wave;
  const targetRow = rows.find((row) => row.id === id);
  if (!targetRow) return null;

  const allIds = rows.map((row) => row.id);
  const [secSnapshot, targetValRows, siblingValRows] = await loadTargetAndSiblingValuations(
    db,
    id,
    targetRow.ticker,
    allIds,
  );
  const scalarMap = new Map(siblingValRows.map((v) => [v.thesisId, v]));
  const thesis = hydrateThesis({
    row: targetRow,
    hypotheses,
    catalysts,
    crossChecks,
    valuationRow: targetValRows[0],
    disciplineRows,
  });
  return {
    thesis,
    allTheses: buildSummaries(rows, scalarMap),
    glossary,
    secSnapshot,
    savedOutputs,
    revisions,
    reviews,
    latestAgentRun,
    inboundCrossChecks,
    researchNotes,
  };
}
