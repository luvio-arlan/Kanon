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
import type * as R from "../schemas/research";
import type { HypothesisStatus, SparklinePoint } from "../schemas/thesis";
import type { HypothesisKpiRule, ResearchNoteKind } from "../schemas/v7-research-os";
import {
  kanonResearchNotesPolicies,
  kanonThesesPolicies,
  kanonThesisChildPolicies,
} from "./repositories/security/rls-policies";
import { glossaryTermsTable } from "./schema-extensions";

export * from "./schema-decisions";
export * from "./schema-enterprise";
export * from "./schema-extensions";
export * from "./schema-intel";
export * from "./schema-platform";
export * from "./schema-warehouse";
export * from "./schema-workflows";

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
    status: text("status").$type<R.ThesisStatus>().notNull().default("active"),
    portfolioRole: text("portfolio_role").$type<R.PortfolioRole>().notNull().default("watchlist"),
    currentWeightPct: doublePrecision("current_weight_pct").notNull().default(0),
    targetMaxWeightPct: doublePrecision("target_max_weight_pct").notNull().default(15),
    avgCostBasis: doublePrecision("avg_cost_basis"),
    businessFilter: jsonb("business_filter").$type<R.BusinessFilter>().notNull(),
    lastReviewedLabel: text("last_reviewed_label").notNull(),
    securityId: text("security_id"),
    orgId: text("org_id"),
    priceAsOf: timestamp("price_as_of", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_theses_user_ticker").on(table.userId, table.ticker),
    ...kanonThesesPolicies(),
  ],
).enableRLS();

const thesisFk = () =>
  text("thesis_id")
    .notNull()
    .references(() => thesesTable.id, { onDelete: "cascade" });

export const hypothesesTable = pgTable(
  "hypotheses",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    sortOrder: integer("sort_order").notNull(),
    title: text("title").notNull(),
    metricLabel: text("metric_label").notNull(),
    threshold: text("threshold").notNull(),
    status: text("status").$type<HypothesisStatus>().notNull().default("watching"),
    note: text("note").notNull(),
    kpiRule: jsonb("kpi_rule").$type<HypothesisKpiRule | null>(),
  },
  () => kanonThesisChildPolicies("hypotheses"),
).enableRLS();

export const crossChecksTable = pgTable(
  "cross_checks",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    peerCompany: text("peer_company").notNull(),
    peerRole: text("peer_role").$type<R.PeerRole>().notNull(),
    topic: text("topic").notNull(),
    sourceAnchor: text("source_anchor").notNull(),
    statement: text("statement").notNull(),
    alignment: text("alignment").$type<R.Alignment>().notNull().default("pending"),
    takeaway: text("takeaway").notNull(),
    linkedThesisId: text("linked_thesis_id"),
    hypothesisId: text("hypothesis_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("cross_checks"),
).enableRLS();

export const valuationScenariosTable = pgTable(
  "valuation_scenarios",
  {
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
    modelMode: text("model_mode").$type<R.ValuationModelMode>().notNull().default("pe"),
    driverInputs: jsonb("driver_inputs").$type<R.ValuationDriverInputs | null>(),
    priceHistory: jsonb("price_history").$type<SparklinePoint[]>().notNull(),
  },
  () => kanonThesisChildPolicies("valuation_scenarios"),
).enableRLS();

export const disciplineEntriesTable = pgTable(
  "discipline_entries",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    action: text("action").$type<R.TradeAction>().notNull(),
    noLeverageConfirmed: boolean("no_leverage_confirmed").notNull(),
    positionCapConfirmed: boolean("position_cap_confirmed").notNull(),
    exitRule: text("exit_rule").notNull(),
    emotion: text("emotion").$type<R.EmotionState>().notNull(),
    priceAnchor: doublePrecision("price_anchor").notNull(),
    weightDeltaPct: doublePrecision("weight_delta_pct"),
    benchmarkPrice: doublePrecision("benchmark_price"),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("discipline_entries"),
).enableRLS();

export const researchNotesTable = pgTable(
  "research_notes",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<ResearchNoteKind>().notNull().default("earnings_call"),
    periodLabel: text("period_label").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    guidanceMetric: text("guidance_metric").notNull().default(""),
    guidancePromised: text("guidance_promised").notNull().default(""),
    guidanceDelivered: text("guidance_delivered").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonResearchNotesPolicies(),
).enableRLS();

export const copilotOutputsTable = pgTable(
  "copilot_outputs",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    action: text("action").$type<"earnings_digest" | "red_team" | "investment_memo">().notNull(),
    engine: text("engine").$type<"vercel-ai-sdk" | "grounded-local">().notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("copilot_outputs"),
).enableRLS();

export const thesisRevisionsTable = pgTable(
  "thesis_revisions",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    step: text("step").$type<R.RevisionStep>().notNull(),
    summary: text("summary").notNull(),
    currentPrice: doublePrecision("current_price").notNull(),
    baseTargetPrice: doublePrecision("base_target_price").notNull(),
    riskRewardRatio: doublePrecision("risk_reward_ratio"),
    readinessScore: integer("readiness_score").notNull().default(0),
    snapshotJson: jsonb("snapshot_json").$type<R.RevisionSnapshot | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("thesis_revisions"),
).enableRLS();

export const quarterlyReviewsTable = pgTable(
  "quarterly_reviews",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    quarterLabel: text("quarter_label").notNull(),
    summary: text("summary").notNull(),
    hypothesisVerdicts: jsonb("hypothesis_verdicts").$type<R.HypothesisVerdictItem[]>().notNull(),
    priceAtReview: doublePrecision("price_at_review").notNull(),
    baseTargetAtReview: doublePrecision("base_target_at_review").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("quarterly_reviews"),
).enableRLS();

export const agentRunsTable = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    engine: text("engine").$type<"vercel-ai-sdk" | "grounded-local">().notNull(),
    fallbackReason: text("fallback_reason"),
    briefingJson: jsonb("briefing_json").$type<unknown>().notNull(),
    appliedProposalIds: jsonb("applied_proposal_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("agent_runs"),
).enableRLS();

export const thesisCatalystsTable = pgTable(
  "thesis_catalysts",
  {
    id: text("id").primaryKey(),
    thesisId: thesisFk(),
    title: text("title").notNull(),
    dateLabel: text("date_label").notNull(),
    eventDate: text("event_date"),
    datePrecision: text("date_precision").notNull().default("quarter"),
    category: text("category").$type<R.CatalystCategory>().notNull(),
    impact: text("impact").$type<R.CatalystImpact | null>(),
    direction: text("direction").$type<R.CatalystDirection | null>(),
    status: text("status").$type<R.CatalystStatus>().notNull().default("upcoming"),
    verificationMetric: text("verification_metric").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("thesis_catalysts"),
).enableRLS();

export const selectThesisRowSchema = createSelectSchema(thesesTable);
export const insertThesisRowSchema = createInsertSchema(thesesTable);
export const selectGlossaryRowSchema = createSelectSchema(glossaryTermsTable);
