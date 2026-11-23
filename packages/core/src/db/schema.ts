import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type {
  Alignment,
  BusinessFilter,
  EmotionState,
  PeerRole,
  SecFilingItem,
  SecFinancialFact,
  ThesisStatus,
  TradeAction,
} from "../schemas/research";
import type { HypothesisStatus, SparklinePoint } from "../schemas/thesis";

export const thesesTable = pgTable("theses", {
  id: text("id").primaryKey(),
  indexOrder: integer("index_order").notNull(),
  ticker: text("ticker").notNull().unique(),
  companyName: text("company_name").notNull(),
  sectorTag: text("sector_tag").notNull(),
  currentPrice: doublePrecision("current_price").notNull(),
  horizonYears: integer("horizon_years").notNull().default(3),
  convictionSummary: text("conviction_summary").notNull(),
  status: text("status").$type<ThesisStatus>().notNull().default("active"),
  businessFilter: jsonb("business_filter").$type<BusinessFilter>().notNull(),
  lastReviewedLabel: text("last_reviewed_label").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const selectThesisRowSchema = createSelectSchema(thesesTable);
export const insertThesisRowSchema = createInsertSchema(thesesTable);
export const selectGlossaryRowSchema = createSelectSchema(glossaryTermsTable);
