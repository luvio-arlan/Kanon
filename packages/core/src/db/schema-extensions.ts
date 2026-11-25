import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { UserRole } from "../contracts/auth-contracts";
import type { MarketDataSource, MarketQuoteSnapshot } from "../contracts/market-contracts";
import type { SecFilingDiff, SecFilingSection } from "../contracts/sec-filing-contracts";
import type { ResearchNoteKind } from "../schemas/v7-research-os";

export type ApiTokenScope = "read" | "read_write";

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

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiTokensTable = pgTable("api_tokens", {
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
});

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

export const researchNotesTable = pgTable("research_notes", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id").notNull(),
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
});
