import { sql } from "drizzle-orm";
import { index, jsonb, pgPolicy, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { HypothesisStatus } from "../schemas/thesis";

export type HypothesisEventSource = "step_edit" | "quarterly_review" | "agent_apply" | "import";

export interface DecisionSnapshotPayload {
  thesisId: string;
  ticker: string;
  convictionSummary: string;
  bearTargetPrice: number;
  baseTargetPrice: number;
  bullTargetPrice: number;
  hypotheses: Array<{ id: string; title: string; status: HypothesisStatus; threshold: string }>;
}

const ownOrSys = sql`kanon_rls_is_system() OR kanon_rls_open() OR user_id = kanon_rls_uid()`;
const readThesisOrSys = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_readable(thesis_id)`;
const writeThesisOrSys = sql`kanon_rls_is_system() OR kanon_rls_open() OR kanon_thesis_writable(thesis_id)`;

/** Immutable decision snapshot locked atomically at buy execution (S3). */
export const decisionSnapshotsTable = pgTable(
  "decision_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    transactionId: text("transaction_id").notNull().unique(),
    userId: text("user_id").notNull(),
    thesisId: text("thesis_id").notNull(),
    ticker: text("ticker").notNull(),
    tradeDate: text("trade_date").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    payloadJson: jsonb("payload_json").$type<DecisionSnapshotPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_decision_snapshots_user_ticker").on(table.userId, table.ticker, table.tradeDate),
    index("idx_decision_snapshots_thesis").on(table.thesisId),
    pgPolicy("kanon_decision_snapshots_select", { for: "select", using: ownOrSys }),
    pgPolicy("kanon_decision_snapshots_insert", { for: "insert", withCheck: ownOrSys }),
  ],
).enableRLS();

/** Append-only audit log of every hypothesis status transition for PIT attribution (S3). */
export const hypothesisStatusEventsTable = pgTable(
  "hypothesis_status_events",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    hypothesisId: text("hypothesis_id").notNull(),
    fromStatus: text("from_status").$type<HypothesisStatus | null>(),
    toStatus: text("to_status").$type<HypothesisStatus>().notNull(),
    source: text("source").$type<HypothesisEventSource>().notNull(),
    actorUserId: text("actor_user_id"),
    note: text("note").notNull().default(""),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_hyp_events_thesis_time").on(table.thesisId, table.recordedAt),
    index("idx_hyp_events_hyp_time").on(table.hypothesisId, table.recordedAt),
    pgPolicy("kanon_hyp_events_select", { for: "select", using: readThesisOrSys }),
    pgPolicy("kanon_hyp_events_insert", { for: "insert", withCheck: writeThesisOrSys }),
  ],
).enableRLS();
