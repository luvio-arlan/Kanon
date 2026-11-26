import { describe, expect, it } from "vitest";
import {
  base32Encode,
  buildTotpUri,
  computeTotpCode,
  decryptSecretEnvelope,
  encryptSecretEnvelope,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "./totp";

describe("W7.4 RFC 6238 TOTP & AES-256-GCM Secret Envelope", () => {
  it("matches official RFC 6238 SHA-1 test vectors (6-digit truncation)", () => {
    const rfcSecret = base32Encode(Buffer.from("12345678901234567890", "ascii"));
    expect(computeTotpCode(rfcSecret, 59 * 1000).code).toBe("287082");
    expect(computeTotpCode(rfcSecret, 1_111_111_109 * 1000).code).toBe("081804");
    expect(computeTotpCode(rfcSecret, 1_234_567_890 * 1000).code).toBe("005924");
  });

  it("verifies within +/-1 window and blocks step replay", () => {
    const secret = generateTotpSecret();
    const now = 1_760_000_000_000;
    const { code, step } = computeTotpCode(secret, now);
    const ok = verifyTotpCode({ secretBase32: secret, inputCode: code, nowMs: now });
    expect(ok.valid).toBe(true);
    expect(ok.matchedStep).toBe(step);

    const replayed = verifyTotpCode({
      secretBase32: secret,
      inputCode: code,
      nowMs: now,
      lastUsedStep: step,
    });
    expect(replayed.valid).toBe(false);
    expect(buildTotpUri(secret, "+8613800138000")).toContain("otpauth://totp/KANON:");
  });

  it("round-trips AES-256-GCM secret envelope and hashes recovery codes deterministically", () => {
    const secret = generateTotpSecret();
    const cipher = encryptSecretEnvelope(secret);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(cipher).not.toContain(secret);
    expect(decryptSecretEnvelope(cipher)).toBe(secret);
    expect(decryptSecretEnvelope("corrupted")).toBeNull();

    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    const first = codes[0] ?? "";
    expect(hashRecoveryCode(first)).toBe(hashRecoveryCode(first.replace("-", "").toLowerCase()));
  });
});
