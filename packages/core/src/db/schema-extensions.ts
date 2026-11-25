import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { UserRole } from "../contracts/auth-contracts";
import type { MarketDataSource, MarketQuoteSnapshot } from "../contracts/market-contracts";

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
