import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type OrgRole = "owner" | "pm" | "analyst" | "viewer" | "compliance";
export type IcApprovalState = "draft" | "in_review" | "approved" | "rejected" | "archived";

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const membershipsTable = pgTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").$type<OrgRole>().notNull().default("analyst"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.userId] })],
);

export const icApprovalsTable = pgTable("ic_approvals", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id").notNull(),
  orgId: text("org_id"),
  state: text("state").$type<IcApprovalState>().notNull().default("draft"),
  submittedBy: text("submitted_by").notNull(),
  decidedBy: text("decided_by"),
  decisionNote: text("decision_note").notNull().default(""),
  snapshotHash: text("snapshot_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const thesisCommentsTable = pgTable("thesis_comments", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id").notNull(),
  userId: text("user_id").notNull(),
  anchorType: text("anchor_type").notNull().default("thesis"),
  anchorId: text("anchor_id"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    orgId: text("org_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull().default({}),
    prevHash: text("prev_hash").notNull().default(""),
    entryHash: text("entry_hash").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_audit_log_actor_created").on(table.actorUserId, table.createdAt)],
);

export const restrictedListTable = pgTable(
  "restricted_list",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    reason: text("reason").notNull().default(""),
    addedBy: text("added_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_restricted_list_org_ticker").on(table.orgId, table.ticker)],
);
