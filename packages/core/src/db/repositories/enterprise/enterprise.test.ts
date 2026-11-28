import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { formatLocaleCurrency, translateKanon } from "../../../contracts/i18n";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { auditLogTable, thesesTable, usersTable } from "../../schema";
import { assertThesisAccess } from "../thesis/thesis-lookups";
import { getThesisById, listTheses } from "../thesis-queries";
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
  acceptOrgInvitation,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
  hasOrgCapability,
  listUserOrganizations,
  withTenantContext,
} from "./organizations-and-rls-store";

describe("Enterprise Teams, Capability RBAC, IC Approval, Restricted List & Append-Only Audit Log", () => {
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

  async function joinOrg(
    orgId: string,
    invitedBy: string,
    userId: string,
    role: "owner" | "pm" | "analyst" | "viewer" | "compliance",
  ) {
    await db
      .insert(usersTable)
      .values({
        id: userId,
        phoneE164: `+86139${String(Math.abs(userId.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100_000_000).padStart(8, "0")}`,
        displayName: userId,
        passwordHash: "test-hash",
      })
      .onConflictDoNothing();
    const inv = await withTenantContext(db, invitedBy, (tx) =>
      createOrgInvitation(tx, { orgId, inviteeUserId: userId, role, invitedBy }),
    );
    await withTenantContext(db, userId, (tx) =>
      acceptOrgInvitation(tx, { userId, invitationId: inv.id }),
    );
  }

  it("enforces org capability RBAC, thesis-bound IC approvals, maker-checker, state machine & TRUNCATE-proof audit_log", async () => {
    const org = await withTenantContext(db, "user-pm", (tx) =>
      createOrganization(tx, { name: "Kanon Capital", createdBy: "user-pm" }),
    );
    await joinOrg(org.id, "user-pm", "user-analyst", "analyst");
    await joinOrg(org.id, "user-pm", "user-comp", "compliance");
    expect((await listUserOrganizations(db, "user-analyst"))[0]?.role).toBe("analyst");

    // Capability RBAC separation of duties: analyst cannot restrict tickers, compliance cannot approve IC
    expect(hasOrgCapability("analyst", "compliance.restrict")).toBe(false);
    expect(hasOrgCapability("compliance", "compliance.restrict")).toBe(true);
    expect(hasOrgCapability("compliance", "ic.decide")).toBe(false);
    expect(hasOrgCapability("pm", "ic.decide")).toBe(true);

    // Bind thesis-nvda to org so server derives orgId authoritatively
    await db.update(thesesTable).set({ orgId: org.id }).where(eq(thesesTable.id, "thesis-nvda"));

    const submitted = await submitIcApproval(db, {
      thesisId: "thesis-nvda",
      submittedBy: "user-analyst",
    });
    expect(submitted.state).toBe("in_review");
    expect(submitted.orgId).toBe(org.id);

    // Cross-thesis IDOR MUST fail with NOT_FOUND
    await expect(
      decideIcApproval(db, {
        thesisId: "thesis-mu",
        approvalId: submitted.id,
        decidedBy: "user-pm",
        decision: "approved",
      }),
    ).rejects.toThrow(/不属于当前标的/);

    // Analyst CANNOT approve IC memo
    await expect(
      decideIcApproval(db, {
        thesisId: "thesis-nvda",
        approvalId: submitted.id,
        decidedBy: "user-analyst",
        decision: "approved",
      }),
    ).rejects.toThrow(/权限不足/);

    // Owner/PM CAN approve another member's submission
    const approved = await decideIcApproval(db, {
      thesisId: "thesis-nvda",
      approvalId: submitted.id,
      decidedBy: "user-pm",
      decision: "approved",
      decisionNote: "赔率与法证核验通过，批准进入核心池。",
    });
    expect(approved.state).toBe("approved");
    expect((await listIcApprovals(db, "thesis-nvda"))[0]?.state).toBe("approved");

    // State machine: approved -> approved MUST fail
    await expect(
      decideIcApproval(db, {
        thesisId: "thesis-nvda",
        approvalId: submitted.id,
        decidedBy: "user-pm",
        decision: "approved",
      }),
    ).rejects.toThrow(/仅待审记录可表决/);

    // Maker-checker: PM submitting cannot self-approve in org mode
    const pmSub = await submitIcApproval(db, {
      thesisId: "thesis-nvda",
      submittedBy: "user-pm",
    });
    await expect(
      decideIcApproval(db, {
        thesisId: "thesis-nvda",
        approvalId: pmSub.id,
        decidedBy: "user-pm",
        decision: "approved",
      }),
    ).rejects.toThrow(/不可自批/);

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
      addedBy: "user-comp",
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
    const logs = await listAuditLogs(db, "user-pm");
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0]?.entryHash).toHaveLength(64);
    expect(logs[0]?.prevHash).toHaveLength(64);

    // DB trigger MUST block UPDATE, DELETE, and TRUNCATE on audit_log!
    await expect(
      db.update(auditLogTable).set({ action: "tampered" }).where(eq(auditLogTable.id, logId)),
    ).rejects.toThrow();
    await expect(db.delete(auditLogTable).where(eq(auditLogTable.id, logId))).rejects.toThrow();
    await expect(db.execute(sql`TRUNCATE audit_log`)).rejects.toThrow();

    expect(translateKanon("en-US", "brand.slogan")).toBe("Conviction, composed.");
    expect(translateKanon("zh-CN", "discipline.zeroLeverage")).toBe("严守零杠杆铁律");
    expect(formatLocaleCurrency(1234.5, "en-US", "USD")).toContain("$1,234.50");
  });

  it("Wave M: shares org-assigned theses with org members, blocks outsiders, and sets RLS tenant context", async () => {
    const team = await withTenantContext(db, "user-owner", (tx) =>
      createOrganization(tx, { name: "Shared Desk", createdBy: "user-owner" }),
    );
    await joinOrg(team.id, "user-owner", "user-member", "analyst");

    const [seed] = await listTheses(db);
    expect(seed).toBeDefined();
    if (!seed) return;

    await assignThesisToOrganization(db, {
      thesisId: seed.id,
      userId: DEFAULT_WORKSPACE_USER_ID,
      orgId: team.id,
    });

    expect(await assertThesisAccess(db, seed.id, "user-member", "read")).toBe(true);
    expect(await assertThesisAccess(db, seed.id, "user-member", "write")).toBe(true);
    expect(await assertThesisAccess(db, seed.id, "user-member", "delete")).toBe(false);
    expect(await assertThesisAccess(db, seed.id, "user-outsider", "read")).toBe(false);

    await joinOrg(team.id, "user-owner", "user-viewer", "viewer");
    await joinOrg(team.id, "user-owner", "user-comp", "compliance");
    expect(await assertThesisAccess(db, seed.id, "user-viewer", "read")).toBe(true);
    expect(await assertThesisAccess(db, seed.id, "user-viewer", "write")).toBe(false);
    expect(await assertThesisAccess(db, seed.id, "user-comp", "read")).toBe(true);
    expect(await assertThesisAccess(db, seed.id, "user-comp", "write")).toBe(false);
    expect(await assertThesisAccess(db, seed.id, "user-owner", "delete")).toBe(true);
    expect((await getThesisById(db, seed.id, "user-member"))?.id).toBe(seed.id);
    expect(await getThesisById(db, seed.id, "user-outsider")).toBeNull();
    expect((await listTheses(db, "user-member")).some((t) => t.id === seed.id)).toBe(true);

    const setting = await withTenantContext(db, "user-member", async (tx) =>
      tx.execute(sql`SELECT current_setting('kanon.current_user_id', true) AS uid`),
    );
    expect(JSON.stringify(setting)).toContain("user-member");
  });
});
