import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import { type IcApprovalState, icApprovalsTable, thesesTable } from "../../schema";
import { appendAuditLog } from "./audit-and-restricted-store";
import { buildServerThesisSnapshot } from "./ic-snapshot-hash";
import { getOrgMemberRole, hasOrgCapability } from "./organizations-and-rls-store";

export {
  addRestrictedTicker,
  appendAuditLog,
  isTickerRestricted,
  listAuditLogs,
  listRestrictedTickers,
  normalizeCanonicalTicker,
} from "./audit-and-restricted-store";

export class IcApprovalError extends Error {
  readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "STALE_SNAPSHOT";
  readonly status: number;

  constructor(
    code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "STALE_SNAPSHOT",
    message: string,
  ) {
    super(message);
    this.name = "IcApprovalError";
    this.code = code;
    this.status =
      code === "NOT_FOUND"
        ? 404
        : code === "INVALID_STATE" || code === "STALE_SNAPSHOT"
          ? 409
          : 403;
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
    const [existingPending] = await tx
      .select({ id: icApprovalsTable.id })
      .from(icApprovalsTable)
      .where(
        and(eq(icApprovalsTable.thesisId, input.thesisId), eq(icApprovalsTable.state, "in_review")),
      )
      .limit(1);
    if (existingPending) {
      throw new IcApprovalError("INVALID_STATE", "该标的已有待审投委会记录，请先表决或归档。");
    }
    await tx.insert(icApprovalsTable).values({
      id,
      thesisId: input.thesisId,
      orgId: snapshot.orgId,
      state: "in_review",
      submittedBy: input.submittedBy,
      decisionNote: input.note?.trim() ?? "",
      snapshotHash: snapshot.snapshotHash,
      selfAttested: false,
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
): Promise<{ selfAttested: boolean; orgId: string | null }> {
  const [thesis] = await tx
    .select({ userId: thesesTable.userId, orgId: thesesTable.orgId })
    .from(thesesTable)
    .where(eq(thesesTable.id, row.thesisId))
    .limit(1);
  if (!thesis) throw new IcApprovalError("NOT_FOUND", "标的研究不存在。");
  const liveOrgId = thesis.orgId ?? null;
  if ((row.orgId ?? null) !== liveOrgId) {
    throw new IcApprovalError("INVALID_STATE", "归属已变更，原审批快照已失效，请重新提交。");
  }
  if (!liveOrgId) {
    if (thesis.userId !== decidedBy) {
      throw new IcApprovalError("FORBIDDEN", "个人标的仅所有者本人可自审或归档。");
    }
    return { selfAttested: true, orgId: null };
  }
  const role = await getOrgMemberRole(tx, liveOrgId, decidedBy);
  if (!hasOrgCapability(role, "ic.decide")) {
    throw new IcApprovalError(
      "FORBIDDEN",
      "权限不足：仅投资经理 (PM) 或管理员可表决投委会备忘录。",
    );
  }
  if (row.submittedBy === decidedBy && decision !== "archived") {
    throw new IcApprovalError("FORBIDDEN", "组织审批须遵循制衡原则，提交人不可自批。");
  }
  return { selfAttested: false, orgId: liveOrgId };
}

/**
 * Transitions an IC approval with thesis binding, live org consistency, snapshot freshness check,
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
    selfAttested: boolean;
    orgId: string | null;
  },
) {
  const updated = await tx
    .update(icApprovalsTable)
    .set({
      state: input.decision,
      decidedBy: input.decidedBy,
      decisionNote: input.decisionNote?.trim() ?? "",
      selfAttested: input.selfAttested,
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
    orgId: input.orgId,
    action: `ic.${input.decision}`,
    targetType: "ic_approval",
    targetId: input.approvalId,
    metadata: {
      thesisId: row.thesisId,
      snapshotHash: row.snapshotHash,
      selfAttested: input.selfAttested,
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
    const policy = await assertOrgDecisionPolicy(tx, row, input.decidedBy, input.decision);
    if (input.decision === "approved") {
      const liveSnapshot = await buildServerThesisSnapshot(tx, input.thesisId);
      if (!liveSnapshot || liveSnapshot.snapshotHash !== row.snapshotHash) {
        throw new IcApprovalError(
          "STALE_SNAPSHOT",
          "标的判断内容在提交审批后已变更，请重新提交最新快照后再批准。",
        );
      }
    }
    await persistIcDecisionInTx(tx, row, { ...input, ...policy });
    return { id: input.approvalId, state: input.decision, selfAttested: policy.selfAttested };
  });
}

export async function listIcApprovals(db: KanonDb, thesisId: string) {
  return db
    .select()
    .from(icApprovalsTable)
    .where(eq(icApprovalsTable.thesisId, thesisId))
    .orderBy(desc(icApprovalsTable.createdAt));
}

export { addThesisComment, listThesisComments } from "./thesis-comments-store";
