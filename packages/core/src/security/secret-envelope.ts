import crypto from "node:crypto";

export type EnvelopePurpose = "totp" | "byok" | "generic";

export interface EnvelopeContext {
  purpose: EnvelopePurpose;
  userId?: string;
  provider?: string;
}

export interface DecryptedEnvelopeResult {
  plain: string;
  usedKey: "primary" | "prev" | "legacy";
  kid?: string;
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
  if (process.env.VERCEL_ENV !== "production" && !keys.includes(LOCAL_DEV_MASTER_KEY)) {
    keys.push(LOCAL_DEV_MASTER_KEY);
  }
  return keys;
}

export function encryptSecretEnvelope(
  plaintext: string,
  ctx: EnvelopeContext = { purpose: "generic" },
): string {
  const key = derivePurposeKey(resolveMasterKeyMaterial(), ctx.purpose);
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

function decryptV2Envelope(
  parts: readonly string[],
  ctx: EnvelopeContext,
): DecryptedEnvelopeResult | null {
  const kid = parts[1] ?? "";
  const currentKid = resolveEnvelopeKeyId();
  const primary = resolveMasterKeyMaterial();
  const prev = process.env.KANON_CREDENTIALS_MASTER_KEY_PREV?.trim();
  const ordered: Array<{ key: string; usedKey: "primary" | "prev" }> =
    kid === currentKid || !prev
      ? [
          { key: primary, usedKey: kid === currentKid ? "primary" : "prev" },
          ...(prev ? [{ key: prev, usedKey: "prev" as const }] : []),
        ]
      : [
          { key: prev, usedKey: "prev" },
          { key: primary, usedKey: "prev" },
        ];
  for (const attempt of ordered) {
    const plain = decryptV2WithKey(parts, attempt.key, ctx);
    if (plain !== null) return { plain, usedKey: attempt.usedKey, kid };
  }
  return null;
}

export function decryptSecretEnvelopeWithMeta(
  payload: string,
  ctx: EnvelopeContext = { purpose: "generic" },
): DecryptedEnvelopeResult | null {
  const parts = payload.split(":");
  if (parts[0] === "v2" && parts.length === 5) return decryptV2Envelope(parts, ctx);
  if (parts[0] === "v1" && parts.length === 4) {
    for (const candidate of candidateLegacyKeys()) {
      const plain = decryptV1WithKey(parts, candidate);
      if (plain !== null) return { plain, usedKey: "legacy" };
    }
  }
  return null;
}

export function decryptSecretEnvelope(
  payload: string,
  ctx: EnvelopeContext = { purpose: "generic" },
): string | null {
  return decryptSecretEnvelopeWithMeta(payload, ctx)?.plain ?? null;
}
