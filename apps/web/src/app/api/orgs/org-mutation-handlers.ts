import { normalizeChinaPhone, type OrgPostRequestSchema } from "@kanon/core";
import {
  acceptOrgInvitation,
  addRestrictedTicker,
  appendAuditLog,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
  findUserByPhoneE164,
  getOrgMemberRole,
  hasOrgCapability,
  type KanonDb,
  OrgPolicyError,
  removeOrgMember,
  revokeOrgInvitation,
  updateOrgMemberRole,
} from "@kanon/core/db";
import type { NextResponse } from "next/server";
import { jsonError, jsonOk } from "../_lib/http";

export interface OrgMutationResult {
  response: NextResponse;
  inviteNotice?: { userId: string; role: string; invitationId: string };
}

const UNIFORM_INVITE_RESPONSE = {
  accepted: true,
  message: "若该手机号已注册 KANON，系统已向其发送团队邀请。",
} as const;

async function handleInviteMember(
  db: KanonDb,
  userId: string,
  data: {
    orgId: string;
    phone: string;
    role: "owner" | "pm" | "analyst" | "viewer" | "compliance";
  },
  startedAt: number,
): Promise<OrgMutationResult> {
  const role = await getOrgMemberRole(db, data.orgId, userId);
  if (!hasOrgCapability(role, "org.manage_members")) {
    return {
      response: jsonError("权限不足：仅组织管理员可邀请成员。", 403, startedAt, "FORBIDDEN"),
    };
  }
  const phone = normalizeChinaPhone(data.phone);
  if (!phone) {
    return { response: jsonError("请输入有效的 +86 手机号。", 400, startedAt, "INVALID_PHONE") };
  }
  const target = await findUserByPhoneE164(db, phone);
  if (target) {
    const inv = await createOrgInvitation(db, {
      orgId: data.orgId,
      inviteeUserId: target.id,
      role: data.role,
      invitedBy: userId,
    });
    return {
      response: jsonOk(UNIFORM_INVITE_RESPONSE, startedAt, 202),
      inviteNotice: { userId: target.id, role: data.role, invitationId: inv.id },
    };
  }
  return { response: jsonOk(UNIFORM_INVITE_RESPONSE, startedAt, 202) };
}

type MemberRoleMutation =
  | {
      op: "update_role";
      orgId: string;
      userId: string;
      role: "owner" | "pm" | "analyst" | "viewer" | "compliance";
    }
  | { op: "remove_member"; orgId: string; userId: string };

async function executeMemberRoleMutation(
  db: KanonDb,
  userId: string,
  data: MemberRoleMutation,
  startedAt: number,
) {
  if (data.op === "remove_member") {
    const removed = await removeOrgMember(db, {
      orgId: data.orgId,
      userId: data.userId,
      actorUserId: userId,
    });
    if (!removed) return jsonError("成员不存在。", 404, startedAt, "NOT_FOUND");
    await appendAuditLog(db, {
      actorUserId: userId,
      orgId: data.orgId,
      action: "org.remove_member",
      targetType: "membership",
      targetId: data.userId,
    });
    return jsonOk({ ok: true }, startedAt);
  }
  const updated = await updateOrgMemberRole(db, {
    orgId: data.orgId,
    userId: data.userId,
    role: data.role,
    actorUserId: userId,
  });
  if (!updated) return jsonError("成员不存在或尚未接受邀请。", 404, startedAt, "NOT_FOUND");
  await appendAuditLog(db, {
    actorUserId: userId,
    orgId: data.orgId,
    action: "org.update_role",
    targetType: "membership",
    targetId: data.userId,
    metadata: { role: data.role },
  });
  return jsonOk({ ok: true }, startedAt);
}

async function handleMemberRoleChange(
  db: KanonDb,
  userId: string,
  data: MemberRoleMutation,
  startedAt: number,
) {
  const role = await getOrgMemberRole(db, data.orgId, userId);
  if (!hasOrgCapability(role, "org.manage_members")) {
    return jsonError("权限不足：仅组织管理员可调整成员角色。", 403, startedAt, "FORBIDDEN");
  }
  try {
    return await executeMemberRoleMutation(db, userId, data, startedAt);
  } catch (err) {
    if (err instanceof OrgPolicyError) {
      return jsonError(err.message, err.status, startedAt, err.code);
    }
    throw err;
  }
}

async function handleAssignThesis(
  db: KanonDb,
  userId: string,
  data: { orgId: string | null; thesisId: string },
  startedAt: number,
) {
  if (data.orgId) {
    const role = await getOrgMemberRole(db, data.orgId, userId);
    if (!hasOrgCapability(role, "thesis.edit")) {
      return jsonError("权限不足：无法将研究关联至该组织。", 403, startedAt, "FORBIDDEN");
    }
  }
  const updated = await assignThesisToOrganization(db, {
    thesisId: data.thesisId,
    userId,
    orgId: data.orgId,
  });
  if (!updated) {
    return jsonError("标的研究不存在或无权变更归属。", 404, startedAt, "NOT_FOUND");
  }
  return jsonOk({ thesis: updated }, startedAt);
}

async function handleRestrictTicker(
  db: KanonDb,
  userId: string,
  data: { orgId: string; ticker: string; reason: string },
  startedAt: number,
) {
  const role = await getOrgMemberRole(db, data.orgId, userId);
  if (!hasOrgCapability(role, "compliance.restrict")) {
    return jsonError("权限不足：仅合规官或管理员可维护限制名单。", 403, startedAt, "FORBIDDEN");
  }
  const restricted = await addRestrictedTicker(db, {
    orgId: data.orgId,
    ticker: data.ticker,
    reason: data.reason,
    addedBy: userId,
  });
  return jsonOk({ restricted }, startedAt, 201);
}

async function handleAcceptInvite(
  db: KanonDb,
  userId: string,
  data: { invitationId?: string; token?: string },
  startedAt: number,
) {
  try {
    const membership = await acceptOrgInvitation(db, {
      userId,
      invitationId: data.invitationId,
      token: data.token,
    });
    return jsonOk({ membership }, startedAt);
  } catch (err) {
    if (err instanceof OrgPolicyError) {
      return jsonError(err.message, err.status, startedAt, err.code);
    }
    throw err;
  }
}

async function handleRevokeInvite(
  db: KanonDb,
  userId: string,
  data: { orgId: string; invitationId: string },
  startedAt: number,
) {
  const role = await getOrgMemberRole(db, data.orgId, userId);
  if (!hasOrgCapability(role, "org.manage_members")) {
    return jsonError("权限不足：仅组织管理员可撤销邀请。", 403, startedAt, "FORBIDDEN");
  }
  const revoked = await revokeOrgInvitation(db, {
    orgId: data.orgId,
    invitationId: data.invitationId,
    actorUserId: userId,
  });
  if (!revoked) return jsonError("邀请不存在或已失效。", 404, startedAt, "NOT_FOUND");
  return jsonOk({ ok: true }, startedAt);
}

export async function handleOrgMutation(
  db: KanonDb,
  userId: string,
  data: ReturnType<typeof OrgPostRequestSchema.parse>,
  startedAt: number,
): Promise<OrgMutationResult> {
  if (!("op" in data)) {
    const organization = await createOrganization(db, { name: data.name, createdBy: userId });
    return { response: jsonOk({ organization }, startedAt, 201) };
  }
  switch (data.op) {
    case "restrict_ticker":
      return { response: await handleRestrictTicker(db, userId, data, startedAt) };
    case "invite":
      return handleInviteMember(db, userId, data, startedAt);
    case "accept_invite":
      return { response: await handleAcceptInvite(db, userId, data, startedAt) };
    case "revoke_invite":
      return { response: await handleRevokeInvite(db, userId, data, startedAt) };
    case "update_role":
    case "remove_member":
      return { response: await handleMemberRoleChange(db, userId, data, startedAt) };
    case "assign_thesis":
      return { response: await handleAssignThesis(db, userId, data, startedAt) };
    default: {
      const organization = await createOrganization(db, { name: data.name, createdBy: userId });
      return { response: jsonOk({ organization }, startedAt, 201) };
    }
  }
}
