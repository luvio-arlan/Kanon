import { z } from "zod";

export const DEFAULT_WORKSPACE_USER_ID = "usr-demo-kanon";
export const DEMO_ACCOUNT_PHONE_E164 = "+8613800000000";

const CN_MOBILE_DIGITS_RE = /^1[3-9]\d{9}$/;

export function extractChinaMobileDigits(raw: string): string {
  const compact = raw.replace(/[\s\-()]/g, "");
  const withoutPrefix = compact.startsWith("+86")
    ? compact.slice(3)
    : compact.startsWith("0086")
      ? compact.slice(4)
      : compact.startsWith("86") && compact.length === 13
        ? compact.slice(2)
        : compact;
  return withoutPrefix.replace(/\D/g, "").slice(0, 11);
}

export function normalizeChinaPhone(raw: string): string | null {
  const digits = extractChinaMobileDigits(raw);
  if (!CN_MOBILE_DIGITS_RE.test(digits)) return null;
  return `+86${digits}`;
}

export function formatChinaPhoneDisplay(raw: string): string {
  const digits = extractChinaMobileDigits(raw);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
}

export function maskChinaPhone(phoneE164: string): string {
  const digits = extractChinaMobileDigits(phoneE164);
  if (digits.length !== 11) return phoneE164;
  return `+86 ${digits.slice(0, 3)} ···· ${digits.slice(7)}`;
}

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

const PASSWORD_LETTER_RE = /[A-Za-z]/;
const PASSWORD_NUMBER_RE = /\d/;
const PASSWORD_SYMBOL_RE = /[^A-Za-z0-9\s]/;

export interface PasswordRuleItem {
  id: "length" | "letter" | "number" | "symbol";
  label: string;
  required: boolean;
  passed: boolean;
}

export type PasswordStrengthLevel = "empty" | "weak" | "fair" | "good" | "strong";

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordStrengthLevel;
  label: string;
  isValid: boolean;
  rules: PasswordRuleItem[];
}

function scorePasswordTier(
  isValid: boolean,
  passedRequired: number,
  hasBonus: boolean,
): Pick<PasswordStrengthResult, "score" | "level" | "label"> {
  if (!isValid) {
    return passedRequired >= 3
      ? { score: 2, level: "fair", label: "待完善" }
      : { score: 1, level: "weak", label: "较弱" };
  }
  return hasBonus
    ? { score: 4, level: "strong", label: "强密码" }
    : { score: 3, level: "good", label: "良好" };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const lengthOk = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  const hasLetter = PASSWORD_LETTER_RE.test(password);
  const hasNumber = PASSWORD_NUMBER_RE.test(password);
  const hasSymbol = PASSWORD_SYMBOL_RE.test(password);
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const isLong = password.length >= 12;

  const rules: PasswordRuleItem[] = [
    {
      id: "length",
      label: `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} 位字符`,
      required: true,
      passed: lengthOk,
    },
    { id: "letter", label: "包含英文字母", required: true, passed: hasLetter },
    { id: "number", label: "包含数字", required: true, passed: hasNumber },
    { id: "symbol", label: "包含符号（如 !@#$）", required: true, passed: hasSymbol },
  ];

  if (password.length === 0) {
    return { score: 0, level: "empty", label: "待设置", isValid: false, rules };
  }
  const isValid = lengthOk && hasLetter && hasNumber && hasSymbol;
  const passedRequired =
    Number(lengthOk) + Number(hasLetter) + Number(hasNumber) + Number(hasSymbol);
  return { ...scorePasswordTier(isValid, passedRequired, hasMixedCase || isLong), isValid, rules };
}

export const ChinaPhoneInputSchema = z
  .string()
  .trim()
  .transform((val) => normalizeChinaPhone(val))
  .refine((val): val is string => val !== null, {
    message: "请输入有效的 +86 中国大陆 11 位手机号。",
  });

export const PasswordInputSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `密码至少需要 ${PASSWORD_MIN_LENGTH} 位字符。`)
  .max(PASSWORD_MAX_LENGTH, `密码不能超过 ${PASSWORD_MAX_LENGTH} 位字符。`)
  .refine(
    (val) =>
      PASSWORD_LETTER_RE.test(val) && PASSWORD_NUMBER_RE.test(val) && PASSWORD_SYMBOL_RE.test(val),
    {
      message: "密码需同时包含字母、数字与符号。",
    },
  );

export const UserRoleSchema = z.enum(["member", "demo"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PublicUserSchema = z.object({
  id: z.string().min(1),
  phoneE164: z.string().min(1),
  maskedPhone: z.string().min(1),
  displayName: z.string().min(1),
  role: UserRoleSchema,
  createdAt: z.string().min(1),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const RegisterRequestSchema = z
  .object({
    phone: ChinaPhoneInputSchema,
    displayName: z
      .string()
      .trim()
      .max(24, "称呼不超过 24 个字符。")
      .optional()
      .transform((val) => (val && val.length > 0 ? val : undefined)),
    password: PasswordInputSchema,
    confirmPassword: z.string().min(1, "请再次确认密码。"),
    seedStarterWorkspace: z.boolean().default(true),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "两次输入的密码不一致。",
  });
export type RegisterRequest = z.input<typeof RegisterRequestSchema>;
export type ParsedRegisterRequest = z.output<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  phone: ChinaPhoneInputSchema,
  password: z
    .string()
    .min(1, "请输入登录密码。")
    .max(PASSWORD_MAX_LENGTH, `密码不能超过 ${PASSWORD_MAX_LENGTH} 位字符。`),
  totpCode: z.string().trim().max(32).optional(),
});
export type LoginRequest = z.input<typeof LoginRequestSchema>;

export const AuthSuccessResponseSchema = z.object({
  user: PublicUserSchema,
  redirectTo: z.string().min(1),
});
export type AuthSuccessResponse = z.infer<typeof AuthSuccessResponseSchema>;

export const AuthSessionResponseSchema = z.object({
  user: PublicUserSchema.nullable(),
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const TotpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  recoveryCodesRemaining: z.number().int().nonnegative(),
});
export type TotpStatusResponse = z.infer<typeof TotpStatusResponseSchema>;

export const TotpActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("begin") }),
  z.object({ action: z.literal("confirm"), code: z.string().trim().min(6).max(16) }),
]);
export type TotpActionRequest = z.infer<typeof TotpActionRequestSchema>;

export const TotpDisableRequestSchema = z.object({
  code: z.string().trim().min(6).max(32),
});
export type TotpDisableRequest = z.infer<typeof TotpDisableRequestSchema>;

export const TotpEnrollResponseSchema = z.object({
  secret: z.string().min(16),
  otpauthUri: z.string().min(10),
  recoveryCodes: z.array(z.string().min(8)).optional(),
});
export type TotpEnrollResponse = z.infer<typeof TotpEnrollResponseSchema>;
