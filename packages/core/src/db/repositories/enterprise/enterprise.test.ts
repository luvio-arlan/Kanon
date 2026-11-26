import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatLocaleCurrency, translateKanon } from "../../../contracts/i18n";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { auditLogTable } from "../../schema";
import {
  addRestrictedTicker,
  addThesisComment,
  appendAuditLog,
  decideIcApproval,
  isTickerRestricted,
  listAuditLogs,
  listIcApprovals,
  listThesisComments,
  submitIcApproval,
} from "./ic-and-compliance-store";
import {
  addOrgMember,
  createOrganization,
  listUserOrganizations,
} from "./organizations-and-rls-store";

describe("Enterprise Teams, RBAC, IC Approval, Restricted List & Append-Only Audit Log (Stage 7 & W8.4)", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb();
    db = mem.db;
    close = mem.close;
  });

  afterAll(async () => {
    await close();
  });

  it("enforces org RBAC on IC approvals, restricted ticker list, anchored comments, and DB append-only audit_log", async () => {
    const org = await createOrganization(db, { name: "Kanon Capital", createdBy: "user-pm" });
    await addOrgMember(db, { orgId: org.id, userId: "user-analyst", role: "analyst" });
    expect((await listUserOrganizations(db, "user-analyst"))[0]?.role).toBe("analyst");

    const submitted = await submitIcApproval(db, {
      thesisId: "thesis-nvda",
      orgId: org.id,
      submittedBy: "user-analyst",
      snapshotPayload: { baseTargetPrice: 198.4 },
    });
    expect(submitted.state).toBe("in_review");

    // Analyst CANNOT approve IC memo
    await expect(
      decideIcApproval(db, {
        approvalId: submitted.id,
        decidedBy: "user-analyst",
        decision: "approved",
      }),
    ).rejects.toThrow(/权限不足/);

    // Owner/PM CAN approve
    const approved = await decideIcApproval(db, {
      approvalId: submitted.id,
      decidedBy: "user-pm",
      decision: "approved",
      decisionNote: "赔率与法证核验通过，批准进入核心池。",
    });
    expect(approved.state).toBe("approved");
    expect((await listIcApprovals(db, "thesis-nvda"))[0]?.state).toBe("approved");

    await addThesisComment(db, {
      thesisId: "thesis-nvda",
      userId: "user-pm",
      anchorType: "hypothesis",
      anchorId: "h-1",
      body: "请补全下一季数据中心毛利率敏感度区间。",
    });
    expect((await listThesisComments(db, "thesis-nvda")).length).toBe(1);

    await addRestrictedTicker(db, {
      orgId: org.id,
      ticker: "MSFT",
      reason: "MNPI 静默期窗口",
      addedBy: "user-pm",
    });
    expect(await isTickerRestricted(db, org.id, "MSFT")).toBe(true);
    expect(await isTickerRestricted(db, org.id, "NVDA")).toBe(false);

    const logId = await appendAuditLog(db, {
      actorUserId: "user-pm",
      orgId: org.id,
      action: "thesis.export",
      targetType: "thesis",
      targetId: "thesis-nvda",
    });
    expect((await listAuditLogs(db, "user-pm")).length).toBeGreaterThanOrEqual(2);

    // DB trigger MUST block UPDATE and DELETE on audit_log!
    let updateErr: unknown = null;
    try {
      await db.update(auditLogTable).set({ action: "tampered" }).where(eq(auditLogTable.id, logId));
    } catch (err) {
      updateErr = err;
    }
    expect(updateErr).not.toBeNull();
    let deleteErr: unknown = null;
    try {
      await db.delete(auditLogTable).where(eq(auditLogTable.id, logId));
    } catch (err) {
      deleteErr = err;
    }
    expect(deleteErr).not.toBeNull();

    // W8.4 i18n smoke check
    expect(translateKanon("en-US", "brand.slogan")).toBe("Conviction, composed.");
    expect(translateKanon("zh-CN", "discipline.zeroLeverage")).toBe("严守零杠杆铁律");
    expect(formatLocaleCurrency(1234.5, "en-US", "USD")).toContain("$1,234.50");
  });
});
