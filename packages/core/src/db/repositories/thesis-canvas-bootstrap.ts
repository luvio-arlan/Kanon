import { and, asc, desc, eq } from "drizzle-orm";
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
  ThesisStatus,
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
import { listGlossaryTerms } from "./discipline-mutations";
import { listResearchNotes } from "./library/research-notes-store";
import {
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
} from "./review-and-agent-store";
import { listThesisRevisions } from "./revision-queries";
import { getSecSnapshotForUser } from "./sec/user-sec-overrides-store";
import {
  type BootstrapRestatementMarker,
  buildThesisReadAccessWhere,
  getThesisAccess,
  loadRestatementsForTicker,
  type ThesisAccess,
} from "./thesis/thesis-access";
import { fetchSiblingValuations, type ValuationScalarRow } from "./thesis/thesis-lookups";
import { hydrateThesis } from "./thesis-queries";

interface ThesisCanvasBootstrap {
  thesis: ThesisDetail;
  access: ThesisAccess;
  allTheses: ThesisSummary[];
  glossary: GlossaryTerm[];
  secSnapshot: SecSnapshot | null;
  restatements: BootstrapRestatementMarker[];
  savedOutputs: SavedCopilotOutput[];
  revisions: ThesisRevision[];
  reviews: QuarterlyReview[];
  latestAgentRun: SavedAgentRun | null;
  inboundCrossChecks: InboundCrossCheck[];
  researchNotes: ResearchNote[];
}

interface SiblingSummaryRow {
  id: string;
  indexOrder: number;
  ticker: string;
  companyName: string;
  sectorTag: string;
  status: ThesisStatus;
  currentPrice: number;
  horizonYears: number;
}

function buildSummaryValuationInput(row: SiblingSummaryRow, val: ValuationScalarRow | undefined) {
  return sanitizeValuationInput({
    currentPrice: row.currentPrice,
    horizonYears: row.horizonYears,
    bear: {
      eps: val?.bearEps ?? 0,
      peMultiple: val?.bearPe ?? 0,
      probability: val?.bearProb ?? 0.25,
    },
    base: {
      eps: val?.baseEps ?? 0,
      peMultiple: val?.basePe ?? 0,
      probability: val?.baseProb ?? 0.5,
    },
    bull: {
      eps: val?.bullEps ?? 0,
      peMultiple: val?.bullPe ?? 0,
      probability: val?.bullProb ?? 0.25,
    },
  });
}

function buildSummaries(
  rows: readonly SiblingSummaryRow[],
  valMap: Map<string, ValuationScalarRow>,
): ThesisSummary[] {
  return rows.map((row) => {
    const checked = buildSummaryValuationInput(row, valMap.get(row.id));
    const val = checked.ok ? calculateValuationScenarios(checked.input) : null;
    return {
      id: row.id,
      indexLabel: String(row.indexOrder).padStart(2, "0"),
      ticker: row.ticker,
      companyName: row.companyName,
      sectorTag: row.sectorTag,
      status: row.status,
      baseTargetPrice: val?.base.targetPrice ?? 0,
      riskRewardRatio: val?.riskRewardRatio ?? null,
    };
  });
}

async function fetchTargetAndSiblings(db: KanonDb, id: string, userId: string) {
  const accessWhere = await buildThesisReadAccessWhere(db, userId);
  return Promise.all([
    db
      .select()
      .from(thesesTable)
      .where(and(eq(thesesTable.id, id), accessWhere))
      .limit(1),
    db
      .select({
        id: thesesTable.id,
        indexOrder: thesesTable.indexOrder,
        ticker: thesesTable.ticker,
        companyName: thesesTable.companyName,
        sectorTag: thesesTable.sectorTag,
        status: thesesTable.status,
        currentPrice: thesesTable.currentPrice,
        horizonYears: thesesTable.horizonYears,
      })
      .from(thesesTable)
      .where(accessWhere)
      .orderBy(asc(thesesTable.indexOrder)),
    listGlossaryTerms(db),
  ]);
}

function fetchHydrationWave(
  db: KanonDb,
  id: string,
  ticker: string,
  userId: string,
  otherIds: readonly string[],
) {
  return Promise.all([
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
    db
      .select()
      .from(valuationScenariosTable)
      .where(eq(valuationScenariosTable.thesisId, id))
      .limit(1),
    fetchSiblingValuations(db, otherIds),
    getSecSnapshotForUser(db, ticker, userId),
    loadRestatementsForTicker(db, ticker),
    listCopilotOutputs(db, id),
    listThesisRevisions(db, id, 12),
    listQuarterlyReviews(db, id),
    getLatestAgentRun(db, id),
    listInboundCrossChecks(db, id, userId),
    listResearchNotes(db, id),
    getThesisAccess(db, id, userId),
  ]);
}

export async function loadThesisCanvasBootstrap(
  db: KanonDb,
  id: string,
  userId: string,
): Promise<ThesisCanvasBootstrap | null> {
  const [[targetRow], siblingRows, glossary] = await fetchTargetAndSiblings(db, id, userId);
  if (!targetRow) return null;
  const otherIds = siblingRows.map((r) => r.id).filter((sid) => sid !== id);
  const wave = await fetchHydrationWave(db, id, targetRow.ticker, userId, otherIds);
  const access = wave[14];
  if (!access) return null;
  const targetVal = wave[4][0];
  const scalarMap = new Map<string, ValuationScalarRow>(wave[5].map((v) => [v.thesisId, v]));
  if (targetVal) scalarMap.set(targetVal.thesisId, targetVal);
  const thesis = hydrateThesis({
    row: targetRow,
    hypotheses: wave[0],
    catalysts: wave[1],
    crossChecks: wave[2],
    valuationRow: targetVal,
    disciplineRows: wave[3],
  });
  return {
    thesis,
    access,
    allTheses: buildSummaries(siblingRows, scalarMap),
    glossary,
    secSnapshot: wave[6],
    restatements: wave[7],
    savedOutputs: wave[8],
    revisions: wave[9],
    reviews: wave[10],
    latestAgentRun: wave[11],
    inboundCrossChecks: wave[12],
    researchNotes: wave[13],
  };
}
