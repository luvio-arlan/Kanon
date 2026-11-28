import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  kanonSystemOnlyPolicy,
  kanonUserOwnedPolicies,
} from "./repositories/security/rls-policies";

export type AppErrorSource = "server" | "client" | "job";

export const aiUsageTable = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id"),
    route: text("route").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ai_usage_user_created").on(table.userId, table.createdAt),
    ...kanonUserOwnedPolicies("ai_usage"),
  ],
).enableRLS();

export const userAiCredentialsTable = pgTable(
  "user_ai_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    label: text("label").notNull().default(""),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyHint: text("key_hint").notNull(),
    baseUrl: text("base_url"),
    defaultModel: text("default_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_user_ai_creds_user_provider").on(table.userId, table.provider),
    ...kanonUserOwnedPolicies("user_ai_credentials"),
  ],
).enableRLS();

export const appErrorEventsTable = pgTable(
  "app_error_events",
  {
    fingerprint: text("fingerprint").notNull(),
    day: text("day").notNull(),
    source: text("source").$type<AppErrorSource>().notNull(),
    route: text("route").notNull(),
    code: text("code").notNull(),
    sampleRequestId: text("sample_request_id"),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.fingerprint, table.day] }),
    ...kanonSystemOnlyPolicy("app_error_events"),
  ],
).enableRLS();
