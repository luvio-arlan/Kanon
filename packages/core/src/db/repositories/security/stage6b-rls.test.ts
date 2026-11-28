import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { apiTokensTable, auditLogTable, sessionsTable } from "../../schema";
import { createApiToken } from "../account/api-tokens-store";
import { createUserSession, getSessionUser, registerUser } from "../auth-store";
import { appendAuditLog } from "../enterprise/audit-and-restricted-store";
import { withSystemContext, withTenantContext } from "./tenant-context";

describe("V2-1 Stage 6b RLS: sessions, api_tokens, user_totp_factors, audit_log (G40)", () => {
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
});
