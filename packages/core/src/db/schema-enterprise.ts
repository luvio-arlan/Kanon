import { sql } from "drizzle-orm";
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
import {
  kanonAuditLogPolicies,
  kanonMembershipsPolicies,
  kanonOrgInvitationsPolicies,
  kanonRestrictedListPolicies,
  kanonThesisChildPolicies,
  kanonThesisCommentsPolicies,
} from "./repositories/security/rls-policies";

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
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.userId] }), ...kanonMembershipsPolicies()],
).enableRLS();

export const orgInvitationsTable = pgTable(
  "org_invitations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    inviteeUserId: text("invitee_user_id"),
    role: text("role").$type<OrgRole>().notNull(),
    invitedBy: text("invited_by").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_org_invitations_invitee").on(table.inviteeUserId, table.acceptedAt),
    ...kanonOrgInvitationsPolicies(),
  ],
).enableRLS();

export const icApprovalsTable = pgTable(
  "ic_approvals",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    orgId: text("org_id"),
    state: text("state").$type<IcApprovalState>().notNull().default("draft"),
    submittedBy: text("submitted_by").notNull(),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note").notNull().default(""),
    snapshotHash: text("snapshot_hash").notNull(),
    selfAttested: boolean("self_attested").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_ic_approvals_one_in_review")
      .on(table.thesisId)
      .where(sql`${table.state} = 'in_review'`),
    ...kanonThesisChildPolicies("ic_approvals"),
  ],
).enableRLS();

export const thesisCommentsTable = pgTable(
  "thesis_comments",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id").notNull(),
    userId: text("user_id").notNull(),
    anchorType: text("anchor_type").notNull().default("thesis"),
    anchorId: text("anchor_id"),
    body: text("body").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => kanonThesisCommentsPolicies(),
).enableRLS();

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
  (table) => [
    index("idx_audit_log_actor_created").on(table.actorUserId, table.createdAt),
    ...kanonAuditLogPolicies(),
  ],
).enableRLS();

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
  (table) => [
    uniqueIndex("idx_restricted_list_org_ticker").on(table.orgId, table.ticker),
    ...kanonRestrictedListPolicies(),
  ],
).enableRLS();
