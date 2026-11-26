import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { type IcApprovalState, icApprovalsTable, thesisCommentsTable } from "../../schema";
import { appendAuditLog } from "./audit-and-restricted-store";
import { buildServerThesisSnapshot } from "./ic-snapshot-hash";
import { getOrgMemberRole, hasOrgCapability } from "./organizations-and-rls-store";

export {
  addRestrictedTicker,
  appendAuditLog,
  isTickerRestricted,
  isTickerRestrictedForUser,
  listAuditLogs,
  listRestrictedTickers,
} from "./audit-and-restricted-store";

export class IcApprovalError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE";
  readonly status: number;

  constructor(code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE", message: string) {
    super(message);
    this.name = "IcApprovalError";
    this.code = code;
    this.status = code === "NOT_FOUND" ? 404 : code === "INVALID_STATE" ? 409 : 403;
  }
}

export async function submitIcApproval(
  db: KanonDb,
  input: {
    thesisId: string;
    submittedBy: string;
    note?: string;
  },
) {
  const snapshot = await buildServerThesisSnapshot(db, input.thesisId);
  if (!snapshot) throw new IcApprovalError("NOT_FOUND", "标的研究不存在。");
  const id = `ica_${crypto.randomUUID()}`;
  await runInTransaction(db, async (tx) => {
    await tx.insert(icApprovalsTable).values({
      id,
      thesisId: input.thesisId,
      orgId: snapshot.orgId,
      state: "in_review",
      submittedBy: input.submittedBy,
      decisionNote: input.note?.trim() ?? "",
      snapshotHash: snapshot.snapshotHash,
    });
    await appendAuditLog(tx, {
      actorUserId: input.submittedBy,
      orgId: snapshot.orgId,
      action: "ic.submit",
      targetType: "thesis",
      targetId: input.thesisId,
      metadata: { approvalId: id, snapshotHash: snapshot.snapshotHash },
    });
  });
  return {
    id,
    state: "in_review" as IcApprovalState,
    orgId: snapshot.orgId,
    snapshotHash: snapshot.snapshotHash,
  };
}

function assertIcStateTransition(
  current: IcApprovalState,
  next: "approved" | "rejected" | "archived",
) {
  if (next === "archived") {
    if (current === "archived") {
      throw new IcApprovalError("INVALID_STATE", "该审批记录已归档，不可重复归档。");
    }
    return;
  }
  if (current !== "in_review") {
    throw new IcApprovalError(
      "INVALID_STATE",
      `当前状态 (${current}) 不允许流转至 ${next}，仅待审记录可表决。`,
    );
  }
}

async function assertOrgDecisionPolicy(
  tx: KanonDb,
  row: typeof icApprovalsTable.$inferSelect,
  decidedBy: string,
  decision: "approved" | "rejected" | "archived",
) {
  if (!row.orgId) return;
  const role = await getOrgMemberRole(tx, row.orgId, decidedBy);
  if (!hasOrgCapability(role, "ic.decide")) {
    throw new IcApprovalError(
      "FORBIDDEN",
      "权限不足：仅投资经理 (PM) 或管理员可表决投委会备忘录。",
    );
  }
  if (row.submittedBy === decidedBy && decision !== "archived") {
    throw new IcApprovalError("FORBIDDEN", "组织审批须遵循制衡原则，提交人不可自批。");
  }
}

/**
 * Transitions an IC approval with thesis binding, state-machine validation,
 * org capability RBAC (`ic.decide`), maker-checker enforcement, and atomic audit logging.
 */
async function persistIcDecisionInTx(
  tx: KanonDb,
  row: typeof icApprovalsTable.$inferSelect,
  input: {
    thesisId: string;
    approvalId: string;
    decidedBy: string;
    decision: "approved" | "rejected" | "archived";
    decisionNote?: string;
  },
) {
  const updated = await tx
    .update(icApprovalsTable)
    .set({
      state: input.decision,
      decidedBy: input.decidedBy,
      decisionNote: input.decisionNote?.trim() ?? "",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(icApprovalsTable.id, input.approvalId),
        eq(icApprovalsTable.thesisId, input.thesisId),
        eq(icApprovalsTable.state, row.state),
      ),
    )
    .returning();
  if (updated.length === 0) {
    throw new IcApprovalError("INVALID_STATE", "审批状态已变更，请刷新后重试。");
  }
  await appendAuditLog(tx, {
    actorUserId: input.decidedBy,
    orgId: row.orgId,
    action: `ic.${input.decision}`,
    targetType: "ic_approval",
    targetId: input.approvalId,
    metadata: {
      thesisId: row.thesisId,
      snapshotHash: row.snapshotHash,
      note: input.decisionNote ?? "",
    },
  });
}

export async function decideIcApproval(
  db: KanonDb,
  input: {
    thesisId: string;
    approvalId: string;
    decidedBy: string;
    decision: "approved" | "rejected" | "archived";
    decisionNote?: string;
  },
) {
  return runInTransaction(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(icApprovalsTable)
      .where(
        and(
          eq(icApprovalsTable.id, input.approvalId),
          eq(icApprovalsTable.thesisId, input.thesisId),
        ),
      )
      .limit(1);
    if (!row) throw new IcApprovalError("NOT_FOUND", "IC 审批记录不存在或不属于当前标的。");
    assertIcStateTransition(row.state, input.decision);
    await assertOrgDecisionPolicy(tx, row, input.decidedBy, input.decision);
    await persistIcDecisionInTx(tx, row, input);
    return { id: input.approvalId, state: input.decision };
  });
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
