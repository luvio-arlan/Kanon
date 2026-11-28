import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import {
  apiTokensTable,
  auditLogTable,
  membershipsTable,
  orgInvitationsTable,
  restrictedListTable,
  sessionsTable,
} from "../../schema";
import { createApiToken } from "../account/api-tokens-store";
import { createUserSession, getSessionUser, registerUser } from "../auth-store";
import {
  addRestrictedTicker,
  appendAuditLog,
  isTickerRestricted,
} from "../enterprise/audit-and-restricted-store";
import {
  acceptOrgInvitation,
  createOrganization,
  createOrgInvitation,
  listOrgMembers,
  removeOrgMember,
} from "../enterprise/organizations-and-rls-store";
import { withSystemContext, withTenantContext } from "./tenant-context";

describe("V2-1 Stage 6b RLS: all 7 auth/audit/org tables (40/40 coverage, G40)", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb({ enforceRls: true });
    db = mem.db;
    close = mem.close;
  });

  afterAll(async () => {
    await close();
  });

  async function register(phone: string, displayName: string) {
    const res = await withSystemContext(db, "auth_bootstrap", (tx) =>
      registerUser(tx, {
        phone,
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName,
        seedStarterWorkspace: false,
      }),
    );
    return res.user;
  }

  it("isolates credentials per tenant while pre-auth lookups keep working in auth_bootstrap", async () => {
    const a = await register("+8613800006001", "SixA");
    const b = await register("+8613800006002", "SixB");
    const { token: tokenA } = await withSystemContext(db, "auth_bootstrap", (tx) =>
      createUserSession(tx, a.id),
    );
    await withTenantContext(db, a.id, (tx) => createApiToken(tx, a.id, { name: "ci" }));

    const seenByB = await withTenantContext(db, b.id, async (tx) => ({
      sessions: await tx.select().from(sessionsTable),
      tokens: await tx.select().from(apiTokensTable),
      totp: await tx.execute(sql`SELECT * FROM user_totp_factors`),
    }));
    expect(seenByB.sessions.every((s) => s.userId === b.id)).toBe(true);
    expect(seenByB.tokens).toHaveLength(0);
    expect((Array.isArray(seenByB.totp) ? seenByB.totp : seenByB.totp.rows).length).toBe(0);
    expect(
      (await withTenantContext(db, a.id, (tx) => tx.select().from(apiTokensTable))).length,
    ).toBe(1);

    const resolved = await withSystemContext(db, "auth_bootstrap", (tx) =>
      getSessionUser(tx, tokenA),
    );
    expect(resolved?.id).toBe(a.id);
  });

  it("keeps one global audit hash chain across tenants and blocks impersonated inserts", async () => {
    const a = await register("+8613800006003", "AuditA");
    const b = await register("+8613800006004", "AuditB");
    await withTenantContext(db, a.id, (tx) =>
      appendAuditLog(tx, { actorUserId: a.id, action: "t.a", targetType: "x", targetId: "1" }),
    );
    await withTenantContext(db, b.id, (tx) =>
      appendAuditLog(tx, { actorUserId: b.id, action: "t.b", targetType: "x", targetId: "2" }),
    );
    const rows = await withSystemContext(db, "cron_tick", (tx) =>
      tx.select().from(auditLogTable).orderBy(auditLogTable.createdAt, auditLogTable.id),
    );
    const mine = rows.filter((r) => r.action === "t.a" || r.action === "t.b");
    expect(mine).toHaveLength(2);
    expect(mine[1]?.prevHash).toBe(mine[0]?.entryHash);

    const seenByB = await withTenantContext(db, b.id, (tx) => tx.select().from(auditLogTable));
    expect(seenByB.every((r) => r.actorUserId === b.id)).toBe(true);
    await expect(
      withTenantContext(db, b.id, (tx) =>
        appendAuditLog(tx, { actorUserId: a.id, action: "spoof", targetType: "x", targetId: "3" }),
      ),
    ).rejects.toThrow();
  });

  it("enforces memberships, org_invitations & restricted_list RLS with definer flows and fail-closed compliance", async () => {
    const owner = await register("+8613800006005", "OrgOwner");
    const analyst = await register("+8613800006006", "OrgAnalyst");
    const outsider = await register("+8613800006007", "OrgOutsider");

    // No tenant context (kanon_rls_uid() IS NULL) MUST fail closed (SQL 3-valued logic guard)
    await expect(
      createOrganization(db, { name: "NoCtxOrg", createdBy: owner.id }),
    ).rejects.toThrow();

    // Impersonated org creation must fail inside definer
    await expect(
      withTenantContext(db, outsider.id, (tx) =>
        createOrganization(tx, { name: "SpoofOrg", createdBy: owner.id }),
      ),
    ).rejects.toThrow();

    const org = await withTenantContext(db, owner.id, (tx) =>
      createOrganization(tx, { name: "Stage6b Capital", createdBy: owner.id }),
    );
    const inv = await withTenantContext(db, owner.id, (tx) =>
      createOrgInvitation(tx, {
        orgId: org.id,
        inviteeUserId: analyst.id,
        role: "analyst",
        invitedBy: owner.id,
      }),
    );

    // Outsider cannot see org members or invitations, nor self-promote to owner
    const outsiderView = await withTenantContext(db, outsider.id, async (tx) => ({
      members: await tx.select().from(membershipsTable),
      invites: await tx.select().from(orgInvitationsTable),
      restricted: await tx.select().from(restrictedListTable),
    }));
    expect(outsiderView.members).toHaveLength(0);
    expect(outsiderView.invites).toHaveLength(0);
    expect(outsiderView.restricted).toHaveLength(0);
    await expect(
      withTenantContext(db, outsider.id, async (tx) => {
        await tx.insert(membershipsTable).values({
          orgId: org.id,
          userId: outsider.id,
          role: "owner",
          acceptedAt: new Date(),
        });
      }),
    ).rejects.toThrow();

    // Invitee cannot directly UPDATE org_invitations to escalate role to owner
    const tampered = await withTenantContext(db, analyst.id, (tx) =>
      tx
        .update(orgInvitationsTable)
        .set({ role: "owner" })
        .where(eq(orgInvitationsTable.id, inv.id))
        .returning(),
    );
    expect(tampered).toHaveLength(0);

    // No tenant context (kanon_rls_uid() IS NULL) MUST fail closed on invitation acceptance
    await expect(
      acceptOrgInvitation(db, { userId: analyst.id, invitationId: inv.id }),
    ).rejects.toThrow(/不属于当前登录账号/);

    // Accepting via definer succeeds with the original invited role
    const accepted = await withTenantContext(db, analyst.id, (tx) =>
      acceptOrgInvitation(tx, { userId: analyst.id, invitationId: inv.id }),
    );
    expect(accepted).toEqual({ orgId: org.id, role: "analyst" });
    const membersSeenByAnalyst = await withTenantContext(db, analyst.id, (tx) =>
      listOrgMembers(tx, org.id),
    );
    expect(membersSeenByAnalyst).toHaveLength(2);

    // Compliance restricted_list: analyst cannot write, owner can; former member stays restricted (fail-closed)
    await expect(
      withTenantContext(db, analyst.id, (tx) =>
        addRestrictedTicker(tx, {
          orgId: org.id,
          ticker: "AAPL",
          reason: "Unauthorized",
          addedBy: analyst.id,
        }),
      ),
    ).rejects.toThrow();
    await withTenantContext(db, owner.id, (tx) =>
      addRestrictedTicker(tx, {
        orgId: org.id,
        ticker: "NVDA",
        reason: "MNPI blackout",
        addedBy: owner.id,
      }),
    );
    await withTenantContext(db, owner.id, (tx) =>
      removeOrgMember(tx, { orgId: org.id, userId: analyst.id, actorUserId: owner.id }),
    );
    const formerMemberRows = await withTenantContext(db, analyst.id, (tx) =>
      tx.select().from(restrictedListTable),
    );
    expect(formerMemberRows).toHaveLength(0);
    const stillBlocked = await withTenantContext(db, analyst.id, (tx) =>
      isTickerRestricted(tx, org.id, "NVDA"),
    );
    expect(stillBlocked).toBe(true);
  });
});
