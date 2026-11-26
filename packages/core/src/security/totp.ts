import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(raw: string): Buffer {
  const clean = raw.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20): string {
  return base32Encode(crypto.randomBytes(byteLength));
}

export function buildTotpUri(secret: string, accountLabel: string, issuer = "KANON"): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(accountLabel);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

export function computeTotpCode(
  secretBase32: string,
  timestampMs: number,
): { code: string; step: number } {
  const step = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const key = base32Decode(secretBase32);
  const hmac = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  const mod = 10 ** TOTP_DIGITS;
  return { code: String(binary % mod).padStart(TOTP_DIGITS, "0"), step };
}

export function verifyTotpCode(params: {
  secretBase32: string;
  inputCode: string;
  nowMs?: number;
  windowSteps?: number;
  lastUsedStep?: number | null;
}): { valid: boolean; matchedStep: number | null } {
  const clean = params.inputCode.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return { valid: false, matchedStep: null };
  const nowMs = params.nowMs ?? Date.now();
  const windowSteps = params.windowSteps ?? 1;
  const inputBuf = Buffer.from(clean);
  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const ts = nowMs + delta * TOTP_STEP_SECONDS * 1000;
    const { code, step } = computeTotpCode(params.secretBase32, ts);
    if (
      params.lastUsedStep !== null &&
      params.lastUsedStep !== undefined &&
      step <= params.lastUsedStep
    ) {
      continue;
    }
    if (crypto.timingSafeEqual(Buffer.from(code), inputBuf)) {
      return { valid: true, matchedStep: step };
    }
  }
  return { valid: false, matchedStep: null };
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(`kanon-recovery:${normalized}`).digest("hex");
}

export type EnvelopePurpose = "totp" | "byok" | "generic";

export interface EnvelopeContext {
  purpose: EnvelopePurpose;
  userId?: string;
  provider?: string;
}

const LOCAL_DEV_MASTER_KEY = "kanon-local-dev-envelope-key-v1";
const MIN_PROD_MASTER_KEY_LEN = 16;

export function isCredentialsMasterKeyConfigured(): boolean {
  const raw = process.env.KANON_CREDENTIALS_MASTER_KEY?.trim() ?? "";
  return raw.length >= MIN_PROD_MASTER_KEY_LEN;
}

function resolveMasterKeyMaterial(): string {
  const raw = process.env.KANON_CREDENTIALS_MASTER_KEY?.trim() ?? "";
  if (raw.length >= MIN_PROD_MASTER_KEY_LEN) return raw;
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("KANON_CREDENTIALS_MASTER_KEY must be configured (>= 16 chars) in production.");
  }
  return raw || LOCAL_DEV_MASTER_KEY;
}

function resolveEnvelopeKeyId(): string {
  const kid = process.env.KANON_CREDENTIALS_KEY_ID?.trim();
  return kid && /^[a-zA-Z0-9_-]{1,24}$/.test(kid) ? kid : "k1";
}

function derivePurposeKey(rawMasterKey: string, purpose: EnvelopePurpose): Buffer {
  return Buffer.from(
    crypto.hkdfSync("sha256", rawMasterKey, "kanon-envelope-salt-v2", `kanon:${purpose}`, 32),
  );
}

function deriveLegacyV1Key(rawMasterKey: string): Buffer {
  return crypto.createHash("sha256").update(rawMasterKey).digest();
}

function buildEnvelopeAad(ctx: EnvelopeContext): Buffer {
  return Buffer.from(`${ctx.purpose}:${ctx.userId ?? ""}:${ctx.provider ?? ""}`, "utf8");
}

function candidateLegacyKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.KANON_CREDENTIALS_MASTER_KEY?.trim();
  if (primary) keys.push(primary);
  const prev = process.env.KANON_CREDENTIALS_MASTER_KEY_PREV?.trim();
  if (prev && prev !== primary) keys.push(prev);
  if (!keys.includes(LOCAL_DEV_MASTER_KEY)) keys.push(LOCAL_DEV_MASTER_KEY);
  return keys;
}

export function needsEnvelopeReencryption(payload: string): boolean {
  return !payload.startsWith("v2:");
}

export function encryptSecretEnvelope(
  plaintext: string,
  ctx: EnvelopeContext = { purpose: "generic" },
): string {
  const masterKey = resolveMasterKeyMaterial();
  const key = derivePurposeKey(masterKey, ctx.purpose);
  const kid = resolveEnvelopeKeyId();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildEnvelopeAad(ctx));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${kid}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptV2WithKey(
  parts: readonly string[],
  rawMasterKey: string,
  ctx: EnvelopeContext,
): string | null {
  try {
    const key = derivePurposeKey(rawMasterKey, ctx.purpose);
    const iv = Buffer.from(parts[2] ?? "", "base64");
    const tag = Buffer.from(parts[3] ?? "", "base64");
    const data = Buffer.from(parts[4] ?? "", "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(buildEnvelopeAad(ctx));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (err) {
    void err;
    return null;
  }
}

function decryptV1WithKey(parts: readonly string[], rawMasterKey: string): string | null {
  try {
    const key = deriveLegacyV1Key(rawMasterKey);
    const iv = Buffer.from(parts[1] ?? "", "base64");
    const tag = Buffer.from(parts[2] ?? "", "base64");
    const data = Buffer.from(parts[3] ?? "", "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (err) {
    void err;
    return null;
  }
}

function decryptLegacyPayload(parts: readonly string[]): string | null {
  for (const candidate of candidateLegacyKeys()) {
    const out = decryptV1WithKey(parts, candidate);
    if (out !== null) return out;
  }
  return null;
}

export function decryptSecretEnvelope(
  payload: string,
  ctx: EnvelopeContext = { purpose: "generic" },
): string | null {
  const parts = payload.split(":");
  if (parts[0] === "v2" && parts.length === 5) {
    const out = decryptV2WithKey(parts, resolveMasterKeyMaterial(), ctx);
    if (out !== null) return out;
    const prev = process.env.KANON_CREDENTIALS_MASTER_KEY_PREV?.trim();
    return prev ? decryptV2WithKey(parts, prev, ctx) : null;
  }
  if (parts[0] === "v1" && parts.length === 4) {
    return decryptLegacyPayload(parts);
  }
  return null;
}
