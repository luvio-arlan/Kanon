import {
  AiCredentialDeleteResponseSchema,
  AiCredentialSaveResponseSchema,
  AiCredentialsVaultResponseSchema,
  type TotpActionRequest,
  TotpConfirmResponseSchema,
  TotpDisableResponseSchema,
  TotpEnrollResponseSchema,
  TotpStatusResponseSchema,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export interface MaskedAiCred {
  id: string;
  provider: string;
  keyHint: string;
  label: string;
  updatedAt?: string;
}

export interface TotpEnrollmentBundle {
  secret: string;
  otpauthUri: string;
}

export async function apiLoadSecurityVault() {
  const [tRes, cRes] = await Promise.all([
    kanonFetch("/api/auth/totp", TotpStatusResponseSchema),
    kanonFetch("/api/auth/ai-credentials", AiCredentialsVaultResponseSchema),
  ]);
  return {
    totpEnabled: tRes.ok ? tRes.data.enabled : false,
    recoveryCodesRemaining: tRes.ok ? tRes.data.recoveryCodesRemaining : 0,
    credentials: cRes.ok ? (cRes.data.credentials as MaskedAiCred[]) : [],
  };
}

export async function apiEnrollTotp(): Promise<
  { ok: true; data: TotpEnrollmentBundle } | { ok: false; error: string }
> {
  const payload: TotpActionRequest = { action: "begin" };
  const res = await kanonFetch("/api/auth/totp", TotpEnrollResponseSchema, {
    method: "POST",
    body: payload,
    fallbackError: "初始化两步验证失败",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { secret: res.data.secret, otpauthUri: res.data.otpauthUri } };
}

export async function apiConfirmTotp(
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const payload: TotpActionRequest = { action: "confirm", code };
  const res = await kanonFetch("/api/auth/totp", TotpConfirmResponseSchema, {
    method: "POST",
    body: payload,
    fallbackError: "动态验证码校验失败",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, recoveryCodes: res.data.recoveryCodes };
}

export async function apiDisableTotp(
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/auth/totp", TotpDisableResponseSchema, {
    method: "DELETE",
    body: { code },
    fallbackError: "停用两步验证失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiSaveVaultCredential(
  provider: string,
  apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await kanonFetch("/api/auth/ai-credentials", AiCredentialSaveResponseSchema, {
    method: "POST",
    body: { provider, apiKey },
    fallbackError: "保存失败",
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function apiDeleteVaultCredential(provider: string): Promise<boolean> {
  const res = await kanonFetch(
    `/api/auth/ai-credentials?provider=${encodeURIComponent(provider)}`,
    AiCredentialDeleteResponseSchema,
    { method: "DELETE" },
  );
  return res.ok;
}
