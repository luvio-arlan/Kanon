import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type AlertRuleKind =
  | "price_hurdle"
  | "new_filing"
  | "form8k_redflag"
  | "kpi_breach"
  | "catalyst_due"
  | "pe_band_breach"
  | "forecast_due";
export type InboxSeverity = "critical" | "warn" | "info";
export type ForecastKind = "binary" | "scenario_3" | "quantile";
export type LedgerAction = "deposit" | "withdraw" | "buy" | "sell" | "dividend";

export const alertRulesTable = pgTable(
  "alert_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id"),
    kind: text("kind").$type<AlertRuleKind>().notNull(),
    configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    lastState: text("last_state"),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_alert_rules_user_thesis_kind").on(
      table.userId,
      sql`COALESCE(${table.thesisId}, '')`,
      table.kind,
    ),
  ],
);

export const inboxItemsTable = pgTable(
  "inbox_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id"),
    kind: text("kind").notNull(),
    severity: text("severity").$type<InboxSeverity>().notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceUrl: text("source_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_inbox_items_user_created").on(table.userId, table.createdAt),
    uniqueIndex("idx_inbox_items_dedupe")
      .on(table.userId, table.kind, table.sourceUrl)
      .where(sql`${table.sourceUrl} IS NOT NULL`),
  ],
);

export const forecastsTable = pgTable(
  "forecasts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id").notNull(),
    hypothesisId: text("hypothesis_id"),
    question: text("question").notNull(),
    forecastKind: text("forecast_kind").$type<ForecastKind>().notNull().default("binary"),
    probabilitiesJson: jsonb("probabilities_json").$type<number[]>().notNull(),
    resolveBy: text("resolve_by").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    outcomeJson: jsonb("outcome_json").$type<{ outcomeIndex: number; note?: string } | null>(),
    lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
    lockedHash: text("locked_hash").notNull(),
  },
  (table) => [index("idx_forecasts_user_thesis").on(table.userId, table.thesisId, table.resolveBy)],
);

export const calendarTokensTable = pgTable(
  "calendar_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_calendar_tokens_user_id").on(table.userId),
    uniqueIndex("idx_calendar_tokens_hash")
      .on(table.tokenHash)
      .where(sql`${table.tokenHash} IS NOT NULL`),
  ],
);

export const portfolioAccountsTable = pgTable("portfolio_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  orgId: text("org_id"),
  name: text("name").notNull(),
  baseCurrency: text("base_currency").notNull().default("USD"),
  cashBalance: doublePrecision("cash_balance").notNull().default(0),
  ledgerInconsistent: boolean("ledger_inconsistent").notNull().default(false),
  noLeverageAcknowledgedAt: timestamp("no_leverage_acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsTable = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id"),
    ticker: text("ticker").notNull(),
    action: text("action").$type<LedgerAction>().notNull(),
    quantity: doublePrecision("quantity").notNull(),
    price: doublePrecision("price").notNull(),
    fees: doublePrecision("fees").notNull().default(0),
    realizedPnl: doublePrecision("realized_pnl"),
    externalRef: text("external_ref"),
    tradeDate: text("trade_date").notNull(),
    noLeverageConfirmed: boolean("no_leverage_confirmed").notNull().default(true),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_transactions_account_date").on(table.accountId, table.tradeDate),
    uniqueIndex("idx_transactions_account_external_ref")
      .on(table.accountId, table.externalRef)
      .where(sql`${table.externalRef} IS NOT NULL`),
  ],
);

export const lotsTable = pgTable(
  "lots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    userId: text("user_id").notNull(),
    ticker: text("ticker").notNull(),
    openDate: text("open_date").notNull(),
    remainingQty: doublePrecision("remaining_qty").notNull(),
    costBasisPerShare: doublePrecision("cost_basis_per_share").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [index("idx_lots_account_ticker").on(table.accountId, table.ticker, table.openDate)],
);
