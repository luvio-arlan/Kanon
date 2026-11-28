import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { FinancialFactDuration } from "../contracts/financial-concepts";
import { kanonThesisChildPolicies } from "./repositories/security/rls-policies";

export type CorporateActionKind = "split" | "dividend" | "spinoff";
export type JobStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type SecuritySecStatus = "active" | "not_registrant";
export type ThesisPeerRole = "peer" | "customer" | "supplier" | "competitor";
export type EstimateMetric = "revenue" | "eps" | "ebit" | "fcf";

export const securitiesTable = pgTable(
  "securities",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker").notNull(),
    exchangeMic: text("exchange_mic").notNull().default("XNAS"),
    cik: text("cik"),
    name: text("name").notNull(),
    shareClass: text("share_class"),
    currency: text("currency").notNull().default("USD"),
    tradingCurrency: text("trading_currency"),
    country: text("country").notNull().default("US"),
    adrRatio: doublePrecision("adr_ratio").notNull().default(1),
    adrRatioSource: text("adr_ratio_source").notNull().default("default"),
    sectorCode: text("sector_code"),
    industryCode: text("industry_code"),
    isActive: boolean("is_active").notNull().default(true),
    secStatus: text("sec_status").$type<SecuritySecStatus>().notNull().default("active"),
    listedAt: text("listed_at"),
    delistedAt: text("delisted_at"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_securities_ticker_exchange").on(table.ticker, table.exchangeMic)],
);

export const fxRatesDailyTable = pgTable(
  "fx_rates_daily",
  {
    currency: text("currency").notNull(),
    rateDate: text("rate_date").notNull(),
    usdPerUnit: doublePrecision("usd_per_unit").notNull(),
    source: text("source").notNull().default("ecb"),
    sourceLicense: text("source_license").notNull().default("ecb_reference"),
  },
  (table) => [primaryKey({ columns: [table.currency, table.rateDate] })],
);

export const priceBarsDailyTable = pgTable(
  "price_bars_daily",
  {
    securityId: text("security_id")
      .notNull()
      .references(() => securitiesTable.id, { onDelete: "cascade" }),
    barDate: text("bar_date").notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    adjClose: doublePrecision("adj_close").notNull(),
    volume: doublePrecision("volume"),
    source: text("source").notNull(),
  },
  (table) => [primaryKey({ columns: [table.securityId, table.barDate] })],
);

export const corporateActionsTable = pgTable("corporate_actions", {
  id: text("id").primaryKey(),
  securityId: text("security_id")
    .notNull()
    .references(() => securitiesTable.id, { onDelete: "cascade" }),
  exDate: text("ex_date").notNull(),
  kind: text("kind").$type<CorporateActionKind>().notNull(),
  ratio: doublePrecision("ratio"),
  amount: doublePrecision("amount"),
  currency: text("currency").notNull().default("USD"),
});

export const filingsTable = pgTable("filings", {
  accession: text("accession").primaryKey(),
  securityId: text("security_id")
    .notNull()
    .references(() => securitiesTable.id, { onDelete: "cascade" }),
  cik: text("cik").notNull(),
  form: text("form").notNull(),
  filedAt: text("filed_at").notNull(),
  periodEnd: text("period_end"),
  fiscalYear: integer("fiscal_year"),
  fiscalPeriod: text("fiscal_period"),
  items: jsonb("items").$type<string[]>().notNull().default([]),
  primaryDocUrl: text("primary_doc_url").notNull(),
  amendsAccession: text("amends_accession"),
  parseStatus: text("parse_status").notNull().default("pending"),
});

export const financialFactsTable = pgTable(
  "financial_facts",
  {
    id: text("id").primaryKey(),
    securityId: text("security_id")
      .notNull()
      .references(() => securitiesTable.id, { onDelete: "cascade" }),
    accession: text("accession")
      .notNull()
      .references(() => filingsTable.accession, { onDelete: "cascade" }),
    concept: text("concept").notNull(),
    xbrlTag: text("xbrl_tag").notNull(),
    taxonomy: text("taxonomy").notNull().default("us-gaap"),
    periodStart: text("period_start"),
    periodEnd: text("period_end").notNull(),
    duration: text("duration").$type<FinancialFactDuration>().notNull(),
    fiscalYear: integer("fiscal_year"),
    fiscalPeriod: text("fiscal_period"),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull().default("USD"),
    currency: text("currency").notNull().default("USD"),
    dimensions: jsonb("dimensions").$type<Record<string, string>>().notNull().default({}),
    filedAt: text("filed_at").notNull(),
    isLatestForPeriod: boolean("is_latest_for_period").notNull().default(true),
  },
  (table) => [
    index("idx_financial_facts_pit").on(
      table.securityId,
      table.concept,
      table.periodEnd,
      table.filedAt,
    ),
  ],
);

export const jobsTable = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    priority: integer("priority").notNull().default(100),
    ownerUserId: text("owner_user_id"),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    status: text("status").$type<JobStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_jobs_pending_priority").on(table.status, table.priority, table.runAt),
    index("idx_jobs_owner_status")
      .on(table.ownerUserId, table.status)
      .where(sql`${table.ownerUserId} IS NOT NULL`),
  ],
);

export const filingChunksTable = pgTable(
  "filing_chunks",
  {
    id: text("id").primaryKey(),
    accession: text("accession")
      .notNull()
      .references(() => filingsTable.accession, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    sectionCode: text("section_code").notNull(),
    paraIndex: integer("para_index").notNull(),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull().default(0),
    charEnd: integer("char_end").notNull().default(0),
    contentHash: text("content_hash").notNull().default(""),
    normHash: text("norm_hash").notNull().default(""),
    extractVersion: text("extract_version").notNull().default("reader/1"),
    embeddingJson: jsonb("embedding_json").$type<number[] | null>(),
  },
  (table) => [
    index("idx_filing_chunks_accession_section").on(
      table.accession,
      table.sectionCode,
      table.paraIndex,
    ),
  ],
);

export const thesisPeersTable = pgTable(
  "thesis_peers",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    ticker: text("ticker").notNull(),
    role: text("role").$type<ThesisPeerRole>().notNull().default("peer"),
    addedBy: text("added_by").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisChildPolicies("thesis_peers"),
).enableRLS();

export const estimatesSnapshotsTable = pgTable("estimates_snapshots", {
  id: text("id").primaryKey(),
  securityId: text("security_id")
    .notNull()
    .references(() => securitiesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  metric: text("metric").$type<EstimateMetric>().notNull(),
  fiscalPeriod: text("fiscal_period").notNull(),
  mean: doublePrecision("mean"),
  median: doublePrecision("median"),
  high: doublePrecision("high"),
  low: doublePrecision("low"),
  analystCount: integer("analyst_count"),
  asOf: text("as_of").notNull(),
});

export const modelVersionsTable = pgTable(
  "model_versions",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    userId: text("user_id").notNull(),
    versionNum: integer("version_num").notNull(),
    label: text("label").notNull(),
    modelKind: text("model_kind").notNull().default("fcff_dcf"),
    inputsJson: jsonb("inputs_json").$type<Record<string, unknown>>().notNull(),
    outputsJson: jsonb("outputs_json").$type<Record<string, unknown>>().notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_model_versions_thesis_num").on(table.thesisId, table.versionNum),
    ...kanonThesisChildPolicies("model_versions"),
  ],
).enableRLS();
