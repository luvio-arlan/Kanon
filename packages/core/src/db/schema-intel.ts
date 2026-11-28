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
} from "drizzle-orm/pg-core";
import type {
  GuidanceBasis,
  GuidanceFiscalPeriod,
  GuidanceMetric,
  GuidanceOutcome,
  GuidanceStatus,
  RedlineChange,
  RedlineSection,
  RedlineStats,
  SegmentAxis,
  SegmentLineKind,
  SegmentReportStatus,
} from "../contracts/intel";
import {
  kanonPublicDerivedPolicies,
  kanonThesisChildPolicies,
} from "./repositories/security/rls-policies";
import { filingsTable, securitiesTable } from "./schema-warehouse";

export type FilingRedlineDbStatus = "ready" | "section_missing" | "too_large" | "failed";

export const filingRedlinesTable = pgTable(
  "filing_redlines",
  {
    currentAccession: text("current_accession")
      .notNull()
      .references(() => filingsTable.accession, { onDelete: "cascade" }),
    previousAccession: text("previous_accession")
      .notNull()
      .references(() => filingsTable.accession, { onDelete: "cascade" }),
    sectionCode: text("section_code").$type<RedlineSection>().notNull(),
    algoVersion: text("algo_version").notNull(),
    status: text("status").$type<FilingRedlineDbStatus>().notNull(),
    statsJson: jsonb("stats_json")
      .$type<RedlineStats | Record<string, never>>()
      .notNull()
      .default({}),
    changesJson: jsonb("changes_json").$type<RedlineChange[]>().notNull().default([]),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.currentAccession,
        table.previousAccession,
        table.sectionCode,
        table.algoVersion,
      ],
    }),
    ...kanonPublicDerivedPolicies("filing_redlines"),
  ],
).enableRLS();

export const segmentReportsTable = pgTable(
  "segment_reports",
  {
    id: text("id").primaryKey(),
    securityId: text("security_id")
      .notNull()
      .references(() => securitiesTable.id, { onDelete: "cascade" }),
    accession: text("accession")
      .notNull()
      .references(() => filingsTable.accession, { onDelete: "cascade" }),
    form: text("form").notNull(),
    axis: text("axis").$type<SegmentAxis>().notNull(),
    axisQname: text("axis_qname").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    fiscalPeriod: text("fiscal_period"),
    currency: text("currency").notNull(),
    revenueConcept: text("revenue_concept").notNull(),
    profitConcept: text("profit_concept"),
    profitIsStandard: boolean("profit_is_standard").notNull().default(false),
    profitReconciled: boolean("profit_reconciled").notNull().default(false),
    periodKind: text("period_kind").$type<"annual" | "quarter">().notNull().default("annual"),
    consolidatedRevenue: doublePrecision("consolidated_revenue"),
    segmentRevenueSum: doublePrecision("segment_revenue_sum"),
    diffPct: doublePrecision("diff_pct"),
    status: text("status").$type<SegmentReportStatus>().notNull(),
    filedAt: text("filed_at").notNull(),
    algoVersion: text("algo_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_segment_reports_security_period").on(
      table.securityId,
      table.axis,
      table.periodEnd,
      table.filedAt,
    ),
    ...kanonPublicDerivedPolicies("segment_reports"),
  ],
).enableRLS();

export const segmentLinesTable = pgTable(
  "segment_lines",
  {
    reportId: text("report_id")
      .notNull()
      .references(() => segmentReportsTable.id, { onDelete: "cascade" }),
    memberQname: text("member_qname").notNull(),
    label: text("label").notNull(),
    labelSource: text("label_source").$type<"label_linkbase" | "qname">().notNull(),
    lineKind: text("line_kind").$type<SegmentLineKind>().notNull(),
    revenue: doublePrecision("revenue"),
    operatingIncome: doublePrecision("operating_income"),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.memberQname] }),
    ...kanonPublicDerivedPolicies("segment_lines"),
  ],
).enableRLS();

export const guidanceCommitmentsTable = pgTable(
  "guidance_commitments",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    securityId: text("security_id").references(() => securitiesTable.id, { onDelete: "set null" }),
    createdBy: text("created_by").notNull(),
    metric: text("metric").$type<GuidanceMetric>().notNull(),
    customLabel: text("custom_label"),
    basis: text("basis").$type<GuidanceBasis>().notNull().default("unspecified"),
    unit: text("unit").$type<"usd" | "pct" | "usd_per_share">(),
    currency: text("currency").notNull().default("USD"),
    targetFiscalYear: integer("target_fiscal_year"),
    targetFiscalPeriod: text("target_fiscal_period").$type<GuidanceFiscalPeriod>(),
    targetPeriodEnd: text("target_period_end"),
    issuedOn: text("issued_on").notNull(),
    low: doublePrecision("low"),
    high: doublePrecision("high"),
    sourceKind: text("source_kind").$type<"filing_chunk" | "research_note" | "manual">().notNull(),
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url"),
    quote: text("quote").notNull().default(""),
    status: text("status").$type<GuidanceStatus>().notNull(),
    supersedesId: text("supersedes_id"),
    extractionJson: jsonb("extraction_json").$type<Record<string, unknown> | null>(),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    actualValue: doublePrecision("actual_value"),
    actualSourceJson: jsonb("actual_source_json").$type<Record<string, unknown> | null>(),
    outcome: text("outcome").$type<GuidanceOutcome>(),
    surprise: doublePrecision("surprise"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionVersion: text("resolution_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_guidance_thesis_period").on(
      table.thesisId,
      table.metric,
      table.targetFiscalYear,
      table.targetFiscalPeriod,
    ),
    ...kanonThesisChildPolicies("guidance_commitments"),
  ],
).enableRLS();
