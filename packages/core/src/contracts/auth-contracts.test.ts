import { describe, expect, it } from "vitest";
import {
  evaluatePasswordStrength,
  extractChinaMobileDigits,
  formatChinaPhoneDisplay,
  maskChinaPhone,
  normalizeChinaPhone,
  RegisterRequestSchema,
} from "./auth-contracts";

describe("KANON +86 Phone & Password Auth Contracts", () => {
  it("normalizes, formats, and masks +86 mainland mobile numbers", () => {
    expect(normalizeChinaPhone("13800138000")).toBe("+8613800138000");
    expect(normalizeChinaPhone("+86 138 0013 8000")).toBe("+8613800138000");
    expect(normalizeChinaPhone("138-0013-8000")).toBe("+8613800138000");
    expect(normalizeChinaPhone("8613912345678")).toBe("+8613912345678");
    expect(normalizeChinaPhone("12800138000")).toBeNull();
    expect(normalizeChinaPhone("1380013")).toBeNull();

    expect(extractChinaMobileDigits("+86 138 0013 8000")).toBe("13800138000");
    expect(formatChinaPhoneDisplay("13800138000")).toBe("138 0013 8000");
    expect(maskChinaPhone("+8613800138000")).toBe("+86 138 ···· 8000");
  });

  it("evaluates password strength smoothly across tiers", () => {
    expect(evaluatePasswordStrength("").level).toBe("empty");
    expect(evaluatePasswordStrength("12345").isValid).toBe(false);
    expect(evaluatePasswordStrength("abcdefgh").isValid).toBe(false);
    expect(evaluatePasswordStrength("kanon2026").isValid).toBe(false);
    expect(evaluatePasswordStrength("kanon2026!").isValid).toBe(true);
    expect(evaluatePasswordStrength("kanon2026!")).toMatchObject({
      isValid: true,
      level: "good",
      score: 3,
    });
    expect(evaluatePasswordStrength("Kanon@2026!")).toMatchObject({
      isValid: true,
      level: "strong",
      score: 4,
    });
    expect(evaluatePasswordStrength("Kanon@2026!123456789012345").isValid).toBe(false);
  });

  it("validates register payloads including confirmPassword parity", () => {
    const ok = RegisterRequestSchema.safeParse({
      phone: "139 8888 7777",
      displayName: "长期主义者",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
      seedStarterWorkspace: true,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.phone).toBe("+8613988887777");
      expect(ok.data.displayName).toBe("长期主义者");
    }

    const mismatch = RegisterRequestSchema.safeParse({
      phone: "13988887777",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026?",
      seedStarterWorkspace: false,
    });
    expect(mismatch.success).toBe(false);
  });
});
