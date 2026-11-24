import { asc, desc, eq, inArray } from "drizzle-orm";
import type { SavedAgentRun } from "../../contracts/api-contracts";
import { calculateValuationScenarios } from "../../math/valuation-scenarios";
import type {
  GlossaryTerm,
  InboundCrossCheck,
  QuarterlyReview,
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
  valuationScenariosTable,
} from "../schema";
import { listCopilotOutputs } from "./copilot-store";
import { getSecSnapshot, listGlossaryTerms } from "./discipline-mutations";
import {
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
} from "./review-and-agent-store";
import { listThesisRevisions } from "./revision-queries";
import { buildValuationInput, hydrateThesis } from "./thesis-queries";

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
}

function buildSummaries(
  rows: readonly (typeof thesesTable.$inferSelect)[],
  valMap: Map<string, typeof valuationScenariosTable.$inferSelect>,
): ThesisSummary[] {
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

function fetchThesisChildrenAndValuations(db: KanonDb, id: string, allIds: readonly string[]) {
  return Promise.all([
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
    db
      .select()
      .from(disciplineEntriesTable)
      .where(eq(disciplineEntriesTable.thesisId, id))
      .orderBy(desc(disciplineEntriesTable.createdAt)),
    db
      .select()
      .from(valuationScenariosTable)
      .where(inArray(valuationScenariosTable.thesisId, [...allIds])),
  ]);
}

function fetchCanvasSidecars(db: KanonDb, id: string, ticker: string) {
  return Promise.all([
    getSecSnapshot(db, ticker),
    listGlossaryTerms(db),
    listCopilotOutputs(db, id),
    listThesisRevisions(db, id),
    listQuarterlyReviews(db, id),
    getLatestAgentRun(db, id),
    listInboundCrossChecks(db, id),
  ]);
}

export async function loadThesisCanvasBootstrap(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<ThesisCanvasBootstrap | null> {
  const rows = await db
    .select()
    .from(thesesTable)
    .where(eq(thesesTable.userId, userId))
    .orderBy(asc(thesesTable.indexOrder));
  const targetRow = rows.find((row) => row.id === id);
  if (!targetRow) return null;

  const allIds = rows.map((row) => row.id);
  const [
    [hypotheses, crossChecks, disciplineRows, valuations],
    [secSnapshot, glossary, savedOutputs, revisions, reviews, latestAgentRun, inboundCrossChecks],
  ] = await Promise.all([
    fetchThesisChildrenAndValuations(db, id, allIds),
    fetchCanvasSidecars(db, id, targetRow.ticker),
  ]);

  const valMap = new Map(valuations.map((v) => [v.thesisId, v]));
  const thesis = hydrateThesis({
    row: targetRow,
    hypotheses,
    crossChecks,
    valuationRow: valMap.get(id),
    disciplineRows,
  });

  return {
    thesis,
    allTheses: buildSummaries(rows, valMap),
    glossary,
    secSnapshot,
    savedOutputs,
    revisions,
    reviews,
    latestAgentRun,
    inboundCrossChecks,
  };
}
