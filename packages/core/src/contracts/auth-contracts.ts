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

export interface PasswordRuleItem {
  id: "length" | "letter" | "number" | "bonus";
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
  rawCount: number,
): Pick<PasswordStrengthResult, "score" | "level" | "label"> {
  if (!isValid) {
    return rawCount >= 2
      ? { score: 2, level: "fair", label: "待完善" }
      : { score: 1, level: "weak", label: "较弱" };
  }
  return rawCount >= 4
    ? { score: 4, level: "strong", label: "强密码" }
    : { score: 3, level: "good", label: "良好" };
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const lengthOk = password.length >= 8 && password.length <= 64;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasMixedOrSymbol =
    (/[a-z]/.test(password) && /[A-Z]/.test(password)) || /[^A-Za-z0-9]/.test(password);
  const isLong = password.length >= 12;

  const rules: PasswordRuleItem[] = [
    { id: "length", label: "8–64 位字符", required: true, passed: lengthOk },
    { id: "letter", label: "包含英文字母", required: true, passed: hasLetter },
    { id: "number", label: "包含数字", required: true, passed: hasNumber },
    {
      id: "bonus",
      label: "含大小写 / 符号或 12 位以上（更强）",
      required: false,
      passed: hasMixedOrSymbol || isLong,
    },
  ];

  if (password.length === 0) {
    return { score: 0, level: "empty", label: "待设置", isValid: false, rules };
  }
  const isValid = lengthOk && hasLetter && hasNumber;
  const rawCount =
    Number(lengthOk) +
    Number(hasLetter) +
    Number(hasNumber) +
    Number(hasMixedOrSymbol) +
    Number(isLong);
  return { ...scorePasswordTier(isValid, rawCount), isValid, rules };
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
  .min(8, "密码至少需要 8 位字符。")
  .max(64, "密码不能超过 64 位字符。")
  .refine((val) => /[A-Za-z]/.test(val) && /\d/.test(val), {
    message: "密码需同时包含英文字母与数字。",
  });

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
  password: z.string().min(1, "请输入登录密码。").max(64, "密码长度超出限制。"),
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
