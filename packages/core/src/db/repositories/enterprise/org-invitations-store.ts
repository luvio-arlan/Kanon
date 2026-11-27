import crypto from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { KanonDb } from "../../bootstrap";
import { runInTransaction } from "../../client";
import {
  membershipsTable,
  type OrgRole,
  organizationsTable,
  orgInvitationsTable,
} from "../../schema";
import { appendAuditLog } from "./audit-and-restricted-store";

export class OrgPolicyError extends Error {
  readonly code: "LAST_OWNER_PROTECTED" | "INVALID_INVITATION" | "FORBIDDEN";
  readonly status: number;

  constructor(
    code: "LAST_OWNER_PROTECTED" | "INVALID_INVITATION" | "FORBIDDEN",
    message: string,
    status = 409,
  ) {
    super(message);
    this.name = "OrgPolicyError";
    this.code = code;
    this.status = status;
  }
}

export async function assertOrgRetainsOwner(
  tx: KanonDb,
  orgId: string,
  excludingUserId: string,
): Promise<void> {
  const owners = await tx
    .select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(
      and(
        eq(membershipsTable.orgId, orgId),
        eq(membershipsTable.role, "owner"),
        isNotNull(membershipsTable.acceptedAt),
      ),
    );
  const remaining = owners.filter((o) => o.userId !== excludingUserId);
  if (remaining.length === 0) {
    throw new OrgPolicyError(
      "LAST_OWNER_PROTECTED",
      "组织必须保留至少一位管理员 (owner)，无法降级或移除最后一位管理员。",
      409,
    );
  }
}

export async function createOrgInvitation(
  db: KanonDb,
  input: {
    orgId: string;
    inviteeUserId: string;
    role: OrgRole;
    invitedBy: string;
    ttlHours?: number;
  },
) {
  const id = `inv_${crypto.randomUUID()}`;
  const rawToken = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + (input.ttlHours ?? 168) * 3600 * 1000);
  await runInTransaction(db, async (tx) => {
    await tx.insert(orgInvitationsTable).values({
      id,
      orgId: input.orgId,
      inviteeUserId: input.inviteeUserId,
      role: input.role,
      invitedBy: input.invitedBy,
      tokenHash,
      expiresAt,
    });
    await appendAuditLog(tx, {
      actorUserId: input.invitedBy,
      orgId: input.orgId,
      action: "org.invite_member",
      targetType: "org_invitation",
      targetId: id,
      metadata: { role: input.role },
    });
  });
  return { id, token: rawToken, expiresAt };
}

export async function listPendingOrgInvitations(db: KanonDb, userId: string) {
  const now = new Date();
  return db
    .select({
      id: orgInvitationsTable.id,
      orgId: orgInvitationsTable.orgId,
      orgName: organizationsTable.name,
      role: orgInvitationsTable.role,
      invitedBy: orgInvitationsTable.invitedBy,
      expiresAt: orgInvitationsTable.expiresAt,
      createdAt: orgInvitationsTable.createdAt,
    })
    .from(orgInvitationsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, orgInvitationsTable.orgId))
    .where(
      and(
        eq(orgInvitationsTable.inviteeUserId, userId),
        isNull(orgInvitationsTable.acceptedAt),
        gt(orgInvitationsTable.expiresAt, now),
      ),
    )
    .orderBy(desc(orgInvitationsTable.createdAt));
}

function buildInvitationLookupWhere(input: {
  userId: string;
  invitationId?: string;
  token?: string;
}) {
  if (input.token) {
    const tokenHash = crypto.createHash("sha256").update(input.token.trim()).digest("hex");
    return and(
      eq(orgInvitationsTable.tokenHash, tokenHash),
      isNull(orgInvitationsTable.acceptedAt),
    );
  }
  if (input.invitationId) {
    return and(
      eq(orgInvitationsTable.id, input.invitationId),
      eq(orgInvitationsTable.inviteeUserId, input.userId),
      isNull(orgInvitationsTable.acceptedAt),
    );
  }
  return null;
}

export async function acceptOrgInvitation(
  db: KanonDb,
  input: { userId: string; invitationId?: string; token?: string },
) {
  return runInTransaction(db, async (tx) => {
    const now = new Date();
    const cond = buildInvitationLookupWhere(input);
    if (!cond) throw new OrgPolicyError("INVALID_INVITATION", "缺少有效的邀请凭证。", 400);
    const [inv] = await tx.select().from(orgInvitationsTable).where(cond).limit(1);
    if (!inv || inv.expiresAt.getTime() <= now.getTime()) {
      throw new OrgPolicyError("INVALID_INVITATION", "邀请不存在、已使用或已过期。", 404);
    }
    if (inv.inviteeUserId && inv.inviteeUserId !== input.userId) {
      throw new OrgPolicyError("FORBIDDEN", "该邀请不属于当前登录账号。", 403);
    }
    await tx
      .update(orgInvitationsTable)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(orgInvitationsTable.id, inv.id),
          eq(orgInvitationsTable.orgId, inv.orgId),
          isNull(orgInvitationsTable.acceptedAt),
        ),
      );
    await tx
      .insert(membershipsTable)
      .values({ orgId: inv.orgId, userId: input.userId, role: inv.role, acceptedAt: now })
      .onConflictDoUpdate({
        target: [membershipsTable.orgId, membershipsTable.userId],
        set: { role: inv.role, acceptedAt: now },
      });
    await appendAuditLog(tx, {
      actorUserId: input.userId,
      orgId: inv.orgId,
      action: "org.accept_invite",
      targetType: "membership",
      targetId: input.userId,
      metadata: { invitationId: inv.id, role: inv.role },
    });
    return { orgId: inv.orgId, role: inv.role };
  });
}

/** Runs a callback inside a transaction with Postgres RLS `kanon.current_user_id` bound locally. */
export async function withTenantContext<T>(
  db: KanonDb,
  userId: string,
  fn: (tx: KanonDb) => Promise<T>,
): Promise<T> {
  return runInTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT set_config('kanon.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}
