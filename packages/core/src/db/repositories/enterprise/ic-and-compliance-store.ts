import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import {
  auditLogTable,
  type IcApprovalState,
  icApprovalsTable,
  restrictedListTable,
  thesisCommentsTable,
} from "../../schema";
import { getOrgMemberRole, roleMeetsMinimum } from "./organizations-and-rls-store";

export async function appendAuditLog(
  db: KanonDb,
  input: {
    actorUserId: string;
    orgId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  const id = `aud_${crypto.randomUUID()}`;
  await db.insert(auditLogTable).values({
    id,
    actorUserId: input.actorUserId,
    orgId: input.orgId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadataJson: input.metadata ?? {},
  });
  return id;
}

export async function listAuditLogs(db: KanonDb, actorUserId: string, limit = 50) {
  return db
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.actorUserId, actorUserId))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(limit);
}

export async function submitIcApproval(
  db: KanonDb,
  input: {
    thesisId: string;
    orgId?: string | null;
    submittedBy: string;
    snapshotPayload: unknown;
  },
) {
  const id = `ica_${crypto.randomUUID()}`;
  const snapshotHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input.snapshotPayload ?? {}))
    .digest("hex");
  await db.insert(icApprovalsTable).values({
    id,
    thesisId: input.thesisId,
    orgId: input.orgId ?? null,
    state: "in_review",
    submittedBy: input.submittedBy,
    snapshotHash,
  });
  await appendAuditLog(db, {
    actorUserId: input.submittedBy,
    orgId: input.orgId,
    action: "ic.submit",
    targetType: "thesis",
    targetId: input.thesisId,
    metadata: { approvalId: id, snapshotHash },
  });
  return { id, state: "in_review" as IcApprovalState, snapshotHash };
}

/**
 * Transitions an IC approval to `approved` or `rejected`.
 * Enforces RBAC when bound to an organization (requires `pm` or `owner` role).
 */
export async function decideIcApproval(
  db: KanonDb,
  input: {
    approvalId: string;
    decidedBy: string;
    decision: "approved" | "rejected" | "archived";
    decisionNote?: string;
  },
) {
  const [row] = await db
    .select()
    .from(icApprovalsTable)
    .where(eq(icApprovalsTable.id, input.approvalId))
    .limit(1);
  if (!row) throw new Error("IC 审批记录不存在。");
  if (row.orgId) {
    const role = await getOrgMemberRole(db, row.orgId, input.decidedBy);
    if (!roleMeetsMinimum(role, "pm")) {
      throw new Error("权限不足：仅投资经理 (PM) 或管理员 (Owner) 可审批投委会备忘录。");
    }
  }
  await db
    .update(icApprovalsTable)
    .set({
      state: input.decision,
      decidedBy: input.decidedBy,
      decisionNote: input.decisionNote?.trim() ?? "",
      updatedAt: new Date(),
    })
    .where(eq(icApprovalsTable.id, input.approvalId));
  await appendAuditLog(db, {
    actorUserId: input.decidedBy,
    orgId: row.orgId,
    action: `ic.${input.decision}`,
    targetType: "ic_approval",
    targetId: input.approvalId,
    metadata: { thesisId: row.thesisId, note: input.decisionNote ?? "" },
  });
  return { id: input.approvalId, state: input.decision };
}

export async function listIcApprovals(db: KanonDb, thesisId: string) {
  return db
    .select()
    .from(icApprovalsTable)
    .where(eq(icApprovalsTable.thesisId, thesisId))
    .orderBy(desc(icApprovalsTable.createdAt));
}

export async function addThesisComment(
  db: KanonDb,
  input: {
    thesisId: string;
    userId: string;
    anchorType?: string;
    anchorId?: string | null;
    body: string;
  },
) {
  const id = `cmt_${crypto.randomUUID()}`;
  await db.insert(thesisCommentsTable).values({
    id,
    thesisId: input.thesisId,
    userId: input.userId,
    anchorType: input.anchorType ?? "thesis",
    anchorId: input.anchorId ?? null,
    body: input.body.trim(),
  });
  return id;
}

export async function listThesisComments(db: KanonDb, thesisId: string) {
  return db
    .select()
    .from(thesisCommentsTable)
    .where(eq(thesisCommentsTable.thesisId, thesisId))
    .orderBy(desc(thesisCommentsTable.createdAt));
}

export async function addRestrictedTicker(
  db: KanonDb,
  input: {
    orgId: string;
    ticker: string;
    reason: string;
    addedBy: string;
    expiresAt?: Date | null;
  },
) {
  const ticker = input.ticker.trim().toUpperCase();
  const id = `rst_${crypto.randomUUID()}`;
  await db
    .insert(restrictedListTable)
    .values({
      id,
      orgId: input.orgId,
      ticker,
      reason: input.reason.trim(),
      addedBy: input.addedBy,
      expiresAt: input.expiresAt ?? null,
    })
    .onConflictDoUpdate({
      target: [restrictedListTable.orgId, restrictedListTable.ticker],
      set: { reason: input.reason.trim(), expiresAt: input.expiresAt ?? null },
    });
  await appendAuditLog(db, {
    actorUserId: input.addedBy,
    orgId: input.orgId,
    action: "compliance.restrict_ticker",
    targetType: "restricted_list",
    targetId: ticker,
    metadata: { reason: input.reason.trim() },
  });
  return { id, ticker };
}

export async function isTickerRestricted(
  db: KanonDb,
  orgId: string,
  ticker: string,
  now = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(restrictedListTable)
    .where(
      and(
        eq(restrictedListTable.orgId, orgId),
        eq(restrictedListTable.ticker, ticker.trim().toUpperCase()),
      ),
    )
    .limit(1);
  if (!row) return false;
  if (row.expiresAt && row.expiresAt.getTime() < now.getTime()) return false;
  return true;
}

export async function listRestrictedTickers(db: KanonDb, orgId: string) {
  return db
    .select()
    .from(restrictedListTable)
    .where(eq(restrictedListTable.orgId, orgId))
    .orderBy(desc(restrictedListTable.createdAt));
}
