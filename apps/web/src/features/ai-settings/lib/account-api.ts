import {
  type ApiTokenScope,
  type ApiTokenSummary,
  ChangePasswordResponseSchema,
  type CreateApiTokenResponse,
  CreateApiTokenResponseSchema,
  DeleteOkResponseSchema,
  ListApiTokensResponseSchema,
  type PublicUser,
  RevokeOtherSessionsResponseSchema,
  type SessionSummary,
  SessionsListResponseSchema,
  UpdateProfileResponseSchema,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function apiUpdateProfile(
  displayName: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/auth/profile", UpdateProfileResponseSchema, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return res.ok ? { ok: true, user: res.data.user } : res;
}

export async function apiChangePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true; revokedOtherSessions: number } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/auth/password", ChangePasswordResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.ok ? { ok: true, revokedOtherSessions: res.data.revokedOtherSessions } : res;
}

export async function apiListSessions(): Promise<
  { ok: true; sessions: SessionSummary[] } | { ok: false; error: string }
> {
  const res = await kanonFetch("/api/auth/sessions", SessionsListResponseSchema);
  return res.ok ? { ok: true, sessions: res.data.sessions } : res;
}

export async function apiRevokeOtherSessions(): Promise<
  { ok: true; revokedCount: number } | { ok: false; error: string }
> {
  const res = await kanonFetch("/api/auth/sessions", RevokeOtherSessionsResponseSchema, {
    method: "DELETE",
  });
  return res.ok ? { ok: true, revokedCount: res.data.revokedCount } : res;
}

export async function apiListApiTokens(): Promise<
  { ok: true; tokens: ApiTokenSummary[] } | { ok: false; error: string }
> {
  const res = await kanonFetch("/api/auth/tokens", ListApiTokensResponseSchema);
  return res.ok ? { ok: true, tokens: res.data.tokens } : res;
}

export async function apiCreateApiToken(input: {
  name: string;
  scope?: ApiTokenScope;
  expiresInDays: number | null;
}): Promise<{ ok: true; data: CreateApiTokenResponse } | { ok: false; error: string }> {
  return kanonFetch("/api/auth/tokens", CreateApiTokenResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      scope: input.scope ?? "read",
      expiresInDays: input.expiresInDays,
    }),
  });
}

export async function apiRevokeApiToken(
  tokenId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch(
    `/api/auth/tokens?id=${encodeURIComponent(tokenId)}`,
    DeleteOkResponseSchema,
    { method: "DELETE" },
  );
  return res.ok ? { ok: true } : res;
}
