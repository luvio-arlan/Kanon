import {
  OrgAcceptInviteResponseSchema,
  OrgCreateResponseSchema,
  OrgMemberAddResponseSchema,
  OrgRestrictResponseSchema,
  OrgsLoadResponseSchema,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export type OrgRoleValue = "owner" | "pm" | "analyst" | "viewer" | "compliance";

export interface OrgsWorkspaceSnapshot {
  organizations: Array<{ id: string; name: string; slug: string; role: OrgRoleValue }>;
  restrictedByOrg: Array<{
    orgId: string;
    tickers: Array<{ ticker: string; reason: string; addedAt: string }>;
  }>;
  membersByOrg: Array<{ orgId: string; members: Array<{ userId: string; role: OrgRoleValue }> }>;
  recentAuditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    entryHash?: string;
    createdAt: string;
  }>;
  pendingInvitations?: Array<{
    id: string;
    orgId: string;
    orgName: string;
    role: OrgRoleValue;
    expiresAt: string;
  }>;
}

export async function apiLoadOrgsWorkspace(): Promise<OrgsWorkspaceSnapshot | null> {
  const res = await kanonFetch("/api/orgs", OrgsLoadResponseSchema);
  return res.ok ? res.data : null;
}

export async function apiCreateOrg(
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/orgs", OrgCreateResponseSchema, {
    method: "POST",
    body: { name },
    fallbackError: "创建团队空间失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiInviteOrgMember(input: {
  orgId: string;
  phone: string;
  role: OrgRoleValue;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/orgs", OrgMemberAddResponseSchema, {
    method: "POST",
    body: { op: "invite", ...input },
    fallbackError: "发送邀请失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiAcceptOrgInvite(
  invitationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/orgs", OrgAcceptInviteResponseSchema, {
    method: "POST",
    body: { op: "accept_invite", invitationId },
    fallbackError: "接受邀请失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiAddRestrictedTicker(input: {
  orgId: string;
  ticker: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/orgs", OrgRestrictResponseSchema, {
    method: "POST",
    body: { op: "restrict_ticker", ...input },
    fallbackError: "添加限制名单失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
