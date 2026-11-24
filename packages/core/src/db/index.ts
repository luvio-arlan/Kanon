export {
  createMemoryKanonDb,
  type DbHealthStats,
  getDbHealthStats,
  getKanonDb,
  type KanonDb,
  type KanonDbEngine,
  runInTransaction,
} from "./client";
export {
  KANON_MIGRATIONS,
  KANON_POSTGRES_DDL,
  type KanonMigration,
  runKanonMigrations,
} from "./migrations";
export { importThesisArchive } from "./repositories/archive-importer";
export {
  authenticateUser,
  createUserSession,
  getDemoUser,
  getSessionUser,
  registerUser,
  revokeSession,
  SESSION_TTL_DAYS,
} from "./repositories/auth-store";
export { listCopilotOutputs, upsertCopilotOutput } from "./repositories/copilot-store";
export {
  addDisciplineEntry,
  deleteThesis,
  getSecSnapshot,
  listGlossaryTerms,
  upsertSecSnapshot,
} from "./repositories/discipline-mutations";
export {
  createQuarterlyReview,
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
  markAgentProposalApplied,
  saveAgentRun,
} from "./repositories/review-and-agent-store";
export { listThesisRevisions, recordThesisRevision } from "./repositories/revision-queries";
export { createThesis, updateThesisStep } from "./repositories/thesis-mutations";
export {
  getThesisById,
  listTheses,
  listThesisSummaries,
} from "./repositories/thesis-queries";
export {
  agentRunsTable,
  copilotOutputsTable,
  crossChecksTable,
  disciplineEntriesTable,
  glossaryTermsTable,
  hypothesesTable,
  insertThesisRowSchema,
  quarterlyReviewsTable,
  secFilingsCacheTable,
  selectGlossaryRowSchema,
  selectThesisRowSchema,
  sessionsTable,
  thesesTable,
  thesisRevisionsTable,
  usersTable,
  valuationScenariosTable,
} from "./schema";
