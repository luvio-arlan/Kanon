import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { DEFAULT_WORKSPACE_USER_ID } from "../contracts/auth-contracts";
import type {
  Alignment,
  BusinessFilter,
  CatalystCategory,
  CatalystDirection,
  CatalystImpact,
  CatalystStatus,
  EmotionState,
  HypothesisVerdictItem,
  PeerRole,
  PortfolioRole,
  RevisionSnapshot,
  RevisionStep,
  SecAnnualFinancial,
  SecFilingItem,
  SecFinancialFact,
  SecQuarterlyFinancial,
  ThesisStatus,
  TradeAction,
  ValuationDriverInputs,
  ValuationModelMode,
} from "../schemas/research";
import type { HypothesisStatus, SparklinePoint } from "../schemas/thesis";

export {
  type ApiTokenScope,
  apiTokensTable,
  marketQuotesCacheTable,
  rateLimitBucketsTable,
  secFilingDocumentsCacheTable,
  sessionsTable,
  usersTable,
} from "./schema-extensions";

export const thesesTable = pgTable(
  "theses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(DEFAULT_WORKSPACE_USER_ID),
    indexOrder: integer("index_order").notNull(),
    ticker: text("ticker").notNull(),
    companyName: text("company_name").notNull(),
    sectorTag: text("sector_tag").notNull(),
    currentPrice: doublePrecision("current_price").notNull(),
    horizonYears: integer("horizon_years").notNull().default(3),
    convictionSummary: text("conviction_summary").notNull(),
    status: text("status").$type<ThesisStatus>().notNull().default("active"),
    portfolioRole: text("portfolio_role").$type<PortfolioRole>().notNull().default("watchlist"),
    currentWeightPct: doublePrecision("current_weight_pct").notNull().default(0),
    targetMaxWeightPct: doublePrecision("target_max_weight_pct").notNull().default(15),
    avgCostBasis: doublePrecision("avg_cost_basis"),
    businessFilter: jsonb("business_filter").$type<BusinessFilter>().notNull(),
    lastReviewedLabel: text("last_reviewed_label").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_theses_user_ticker").on(table.userId, table.ticker)],
);

export const hypothesesTable = pgTable("hypotheses", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
  title: text("title").notNull(),
  metricLabel: text("metric_label").notNull(),
  threshold: text("threshold").notNull(),
  status: text("status").$type<HypothesisStatus>().notNull().default("watching"),
  note: text("note").notNull(),
});

export const crossChecksTable = pgTable("cross_checks", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  peerCompany: text("peer_company").notNull(),
  peerRole: text("peer_role").$type<PeerRole>().notNull(),
  topic: text("topic").notNull(),
  sourceAnchor: text("source_anchor").notNull(),
  statement: text("statement").notNull(),
  alignment: text("alignment").$type<Alignment>().notNull().default("pending"),
  takeaway: text("takeaway").notNull(),
  linkedThesisId: text("linked_thesis_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const valuationScenariosTable = pgTable("valuation_scenarios", {
  thesisId: text("thesis_id")
    .primaryKey()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  bearEps: doublePrecision("bear_eps").notNull(),
  bearPe: doublePrecision("bear_pe").notNull(),
  bearProb: doublePrecision("bear_prob").notNull().default(0.25),
  baseEps: doublePrecision("base_eps").notNull(),
  basePe: doublePrecision("base_pe").notNull(),
  baseProb: doublePrecision("base_prob").notNull().default(0.5),
  bullEps: doublePrecision("bull_eps").notNull(),
  bullPe: doublePrecision("bull_pe").notNull(),
  bullProb: doublePrecision("bull_prob").notNull().default(0.25),
  modelMode: text("model_mode").$type<ValuationModelMode>().notNull().default("pe"),
  driverInputs: jsonb("driver_inputs").$type<ValuationDriverInputs | null>(),
  priceHistory: jsonb("price_history").$type<SparklinePoint[]>().notNull(),
});

export const disciplineEntriesTable = pgTable("discipline_entries", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  action: text("action").$type<TradeAction>().notNull(),
  noLeverageConfirmed: boolean("no_leverage_confirmed").notNull(),
  positionCapConfirmed: boolean("position_cap_confirmed").notNull(),
  exitRule: text("exit_rule").notNull(),
  emotion: text("emotion").$type<EmotionState>().notNull(),
  priceAnchor: doublePrecision("price_anchor").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const glossaryTermsTable = pgTable("glossary_terms", {
  term: text("term").primaryKey(),
  fullName: text("full_name").notNull(),
  category: text("category").notNull(),
  plainSummary: text("plain_summary").notNull(),
  filingContext: text("filing_context").notNull(),
  example: text("example").notNull(),
});

export const secFilingsCacheTable = pgTable("sec_filings_cache", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik").notNull(),
  entityName: text("entity_name").notNull(),
  source: text("source").$type<"sec-edgar-live" | "cached-seed">().notNull(),
  filings: jsonb("filings").$type<SecFilingItem[]>().notNull(),
  facts: jsonb("facts").$type<SecFinancialFact[]>().notNull(),
  annuals: jsonb("annuals").$type<SecAnnualFinancial[]>().notNull().default([]),
  quarterlies: jsonb("quarterlies").$type<SecQuarterlyFinancial[]>().notNull().default([]),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const copilotOutputsTable = pgTable("copilot_outputs", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  action: text("action").$type<"earnings_digest" | "red_team" | "investment_memo">().notNull(),
  engine: text("engine").$type<"vercel-ai-sdk" | "grounded-local">().notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const thesisRevisionsTable = pgTable("thesis_revisions", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  step: text("step").$type<RevisionStep>().notNull(),
  summary: text("summary").notNull(),
  currentPrice: doublePrecision("current_price").notNull(),
  baseTargetPrice: doublePrecision("base_target_price").notNull(),
  riskRewardRatio: doublePrecision("risk_reward_ratio"),
  readinessScore: integer("readiness_score").notNull().default(0),
  snapshotJson: jsonb("snapshot_json").$type<RevisionSnapshot | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quarterlyReviewsTable = pgTable("quarterly_reviews", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  quarterLabel: text("quarter_label").notNull(),
  summary: text("summary").notNull(),
  hypothesisVerdicts: jsonb("hypothesis_verdicts").$type<HypothesisVerdictItem[]>().notNull(),
  priceAtReview: doublePrecision("price_at_review").notNull(),
  baseTargetAtReview: doublePrecision("base_target_at_review").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentRunsTable = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  engine: text("engine").$type<"vercel-ai-sdk" | "grounded-local">().notNull(),
  fallbackReason: text("fallback_reason"),
  briefingJson: jsonb("briefing_json").$type<unknown>().notNull(),
  appliedProposalIds: jsonb("applied_proposal_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const thesisCatalystsTable = pgTable("thesis_catalysts", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dateLabel: text("date_label").notNull(),
  category: text("category").$type<CatalystCategory>().notNull(),
  impact: text("impact").$type<CatalystImpact>().notNull(),
  direction: text("direction").$type<CatalystDirection>().notNull(),
  status: text("status").$type<CatalystStatus>().notNull().default("upcoming"),
  verificationMetric: text("verification_metric").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const selectThesisRowSchema = createSelectSchema(thesesTable);
export const insertThesisRowSchema = createInsertSchema(thesesTable);
export const selectGlossaryRowSchema = createSelectSchema(glossaryTermsTable);
