import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { UserRole } from "../contracts/auth-contracts";
import type { MarketDataSource, MarketQuoteSnapshot } from "../contracts/market-contracts";
import type { SecFilingDiff, SecFilingSection } from "../contracts/sec-filing-contracts";
import type {
  SecAnnualFinancial,
  SecFilingItem,
  SecFinancialFact,
  SecInsiderSummary,
  SecQuarterlyFinancial,
} from "../schemas/research";
import { kanonUserOwnedPolicies } from "./repositories/security/rls-policies";

export type ApiTokenScope = "read" | "read_write";

export const glossaryTermsTable = pgTable("glossary_terms", {
  term: text("term").primaryKey(),
  fullName: text("full_name").notNull(),
  category: text("category").notNull(),
  plainSummary: text("plain_summary").notNull(),
  filingContext: text("filing_context").notNull(),
  example: text("example").notNull(),
});

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  phoneE164: text("phone_e164").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("member"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonUserOwnedPolicies("sessions"),
).enableRLS();

export const apiTokensTable = pgTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scope: text("scope").$type<ApiTokenScope>().notNull().default("read"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonUserOwnedPolicies("api_tokens"),
).enableRLS();

export const marketQuotesCacheTable = pgTable("market_quotes_cache", {
  cacheKey: text("cache_key").primaryKey(),
  ticker: text("ticker").notNull(),
  source: text("source").$type<MarketDataSource>().notNull(),
  payload: jsonb("payload").$type<MarketQuoteSnapshot>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const rateLimitBucketsTable = pgTable("rate_limit_buckets", {
  bucketKey: text("bucket_key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const secFilingDocumentsCacheTable = pgTable("sec_filing_documents_cache", {
  accessionNumber: text("accession_number").primaryKey(),
  ticker: text("ticker").notNull(),
  form: text("form").notNull(),
  filingDate: text("filing_date").notNull(),
  documentUrl: text("document_url").notNull(),
  sectionsJson: jsonb("sections_json").$type<SecFilingSection[]>().notNull(),
  diffJson: jsonb("diff_json").$type<SecFilingDiff | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSecOverridesTable = pgTable(
  "user_sec_overrides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    cik: text("cik").notNull(),
    entityName: text("entity_name").notNull(),
    reportingCurrency: text("reporting_currency").notNull().default("USD"),
    fxToUsd: doublePrecision("fx_to_usd").notNull().default(1),
    adrRatio: doublePrecision("adr_ratio").notNull().default(1),
    facts: jsonb("facts").$type<SecFinancialFact[]>().notNull().default([]),
    annuals: jsonb("annuals").$type<SecAnnualFinancial[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.ticker] }),
    ...kanonUserOwnedPolicies("user_sec_overrides"),
  ],
).enableRLS();

export const userTotpFactorsTable = pgTable(
  "user_totp_factors",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    secretEncrypted: text("secret_encrypted").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    recoveryHashes: jsonb("recovery_hashes").$type<string[]>().notNull().default([]),
    lastUsedStep: integer("last_used_step"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonUserOwnedPolicies("user_totp_factors"),
).enableRLS();

export const loginLockoutsTable = pgTable("login_lockouts", {
  accountKey: text("account_key").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secFilingsCacheTable = pgTable("sec_filings_cache", {
  ticker: text("ticker").primaryKey(),
  cik: text("cik").notNull(),
  entityName: text("entity_name").notNull(),
  source: text("source").$type<"sec-edgar-live" | "cached-seed" | "manual-verified">().notNull(),
  reportingCurrency: text("reporting_currency").notNull().default("USD"),
  fxToUsd: doublePrecision("fx_to_usd").notNull().default(1),
  adrRatio: doublePrecision("adr_ratio").notNull().default(1),
  filings: jsonb("filings").$type<SecFilingItem[]>().notNull(),
  facts: jsonb("facts").$type<SecFinancialFact[]>().notNull(),
  annuals: jsonb("annuals").$type<SecAnnualFinancial[]>().notNull().default([]),
  quarterlies: jsonb("quarterlies").$type<SecQuarterlyFinancial[]>().notNull().default([]),
  insiderSummary: jsonb("insider_summary").$type<SecInsiderSummary | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});
