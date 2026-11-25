import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PasswordInputSchema, PublicUserSchema } from "./auth-contracts";

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1, "请输入称呼。").max(24, "称呼不超过 24 个字符。"),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const UpdateProfileResponseSchema = z.object({
  user: PublicUserSchema,
});
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "请输入当前密码。")
      .max(PASSWORD_MAX_LENGTH, `密码不能超过 ${PASSWORD_MAX_LENGTH} 位字符。`),
    newPassword: PasswordInputSchema,
    confirmPassword: z.string().min(1, "请再次确认新密码。"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的新密码不一致。",
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    path: ["newPassword"],
    message: "新密码不能与当前密码相同。",
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const ChangePasswordResponseSchema = z.object({
  ok: z.literal(true),
  revokedOtherSessions: z.number().int().nonnegative(),
});
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;

export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  isCurrent: z.boolean(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionsListResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
});
export type SessionsListResponse = z.infer<typeof SessionsListResponseSchema>;

export const RevokeOtherSessionsResponseSchema = z.object({
  ok: z.literal(true),
  revokedCount: z.number().int().nonnegative(),
});
export type RevokeOtherSessionsResponse = z.infer<typeof RevokeOtherSessionsResponseSchema>;

export const ApiTokenScopeSchema = z.enum(["read", "read_write"]);
export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;

export const ApiTokenSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tokenPrefix: z.string().min(1),
  scope: ApiTokenScopeSchema,
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type ApiTokenSummary = z.infer<typeof ApiTokenSummarySchema>;

export const CreateApiTokenRequestSchema = z.object({
  name: z.string().trim().min(2, "令牌名称至少 2 个字符。").max(40, "令牌名称不超过 40 个字符。"),
  scope: ApiTokenScopeSchema.default("read"),
  expiresInDays: z.number().int().min(7).max(365).nullable().default(90),
});
export type CreateApiTokenRequest = z.input<typeof CreateApiTokenRequestSchema>;

export const CreateApiTokenResponseSchema = z.object({
  token: ApiTokenSummarySchema,
  plaintextToken: z.string().min(16),
});
export type CreateApiTokenResponse = z.infer<typeof CreateApiTokenResponseSchema>;

export const ListApiTokensResponseSchema = z.object({
  tokens: z.array(ApiTokenSummarySchema),
});
export type ListApiTokensResponse = z.infer<typeof ListApiTokensResponseSchema>;

export const McpJsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type McpJsonRpcRequest = z.infer<typeof McpJsonRpcRequestSchema>;
