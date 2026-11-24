import {
  type AuthSuccessResponse,
  AuthSuccessResponseSchema,
  DeleteOkResponseSchema,
  type LoginRequest,
  type RegisterRequest,
} from "@kanon/core";
import { type KanonFetchResult, kanonFetch } from "@/shared/lib/kanon-fetch";

export function registerAccount(
  payload: RegisterRequest,
): Promise<KanonFetchResult<AuthSuccessResponse>> {
  return kanonFetch("/api/auth/register", AuthSuccessResponseSchema, {
    method: "POST",
    body: payload,
    fallbackError: "注册失败，请检查手机号与密码后重试。",
  });
}

export function loginAccount(
  payload: LoginRequest,
): Promise<KanonFetchResult<AuthSuccessResponse>> {
  return kanonFetch("/api/auth/login", AuthSuccessResponseSchema, {
    method: "POST",
    body: payload,
    fallbackError: "登录失败，请核对手机号与密码。",
  });
}

export function logoutAccount(): Promise<KanonFetchResult<{ ok: true }>> {
  return kanonFetch("/api/auth/logout", DeleteOkResponseSchema, {
    method: "POST",
    fallbackError: "退出登录失败，请稍后重试。",
  });
}
