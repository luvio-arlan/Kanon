#!/usr/bin/env node
/**
 * Batch re-encrypts all v1/PREV secret envelopes (user_totp_factors & user_ai_credentials)
 * to the active KANON_CREDENTIALS_MASTER_KEY + KANON_CREDENTIALS_KEY_ID before retiring PREV.
 */
import crypto from "node:crypto";
import postgres from "postgres";

const primary = process.env.KANON_CREDENTIALS_MASTER_KEY?.trim();
const prev = process.env.KANON_CREDENTIALS_MASTER_KEY_PREV?.trim();
const kid = process.env.KANON_CREDENTIALS_KEY_ID?.trim() || "k1";
const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  process.stderr.write("DATABASE_URL is required.\n");
  process.exit(1);
}
if (!primary || primary.length < 16) {
  process.stderr.write("KANON_CREDENTIALS_MASTER_KEY (>= 16 chars) is required.\n");
  process.exit(1);
}

function derivePurposeKey(rawKey, purpose) {
  return Buffer.from(
    crypto.hkdfSync("sha256", rawKey, "kanon-envelope-salt-v2", `kanon:${purpose}`, 32),
  );
}

function buildAad(purpose, userId, provider = "") {
  return Buffer.from(`${purpose}:${userId}:${provider}`, "utf8");
}

function encryptV2(plain, purpose, userId, provider = "") {
  const key = derivePurposeKey(primary, purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildAad(purpose, userId, provider));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${kid}:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

function decryptV2Attempt(parts, rawKey, purpose, userId, provider) {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      derivePurposeKey(rawKey, purpose),
      Buffer.from(parts[2], "base64"),
    );
    decipher.setAAD(buildAad(purpose, userId, provider));
    decipher.setAuthTag(Buffer.from(parts[3], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function decryptV1Attempt(parts, rawKey) {
  try {
    const key = crypto.createHash("sha256").update(rawKey).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function tryDecryptV2(parts, purpose, userId, provider) {
  if (parts[1] === kid) return { alreadyPrimary: true, plain: null };
  for (const candidate of [prev, primary].filter(Boolean)) {
    const plain = decryptV2Attempt(parts, candidate, purpose, userId, provider);
    if (plain !== null) return { alreadyPrimary: false, plain };
  }
  return { alreadyPrimary: false, plain: null };
}

function tryDecryptV1(parts) {
  for (const candidate of [primary, prev].filter(Boolean)) {
    const plain = decryptV1Attempt(parts, candidate);
    if (plain !== null) return { alreadyPrimary: false, plain };
  }
  return { alreadyPrimary: false, plain: null };
}

function tryDecrypt(payload, purpose, userId, provider = "") {
  const parts = payload.split(":");
  if (parts[0] === "v2" && parts.length === 5)
    return tryDecryptV2(parts, purpose, userId, provider);
  if (parts[0] === "v1" && parts.length === 4) return tryDecryptV1(parts);
  return { alreadyPrimary: false, plain: null };
}

const sql = postgres(databaseUrl, { prepare: false });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('kanon.system', 'on', true)`;
    const totpRows = await tx`SELECT user_id, secret_encrypted FROM user_totp_factors`;
    let rotated = 0;
    for (const row of totpRows) {
      const dec = tryDecrypt(row.secret_encrypted, "totp", row.user_id);
      if (dec.alreadyPrimary || !dec.plain) continue;
      const next = encryptV2(dec.plain, "totp", row.user_id);
      await tx`
        UPDATE user_totp_factors SET secret_encrypted = ${next}, updated_at = NOW()
        WHERE user_id = ${row.user_id} AND secret_encrypted = ${row.secret_encrypted}
      `;
      rotated += 1;
    }
    const credRows =
      await tx`SELECT id, user_id, provider, encrypted_api_key FROM user_ai_credentials`;
    for (const row of credRows) {
      const dec = tryDecrypt(row.encrypted_api_key, "byok", row.user_id, row.provider);
      if (dec.alreadyPrimary || !dec.plain) continue;
      const next = encryptV2(dec.plain, "byok", row.user_id, row.provider);
      await tx`
        UPDATE user_ai_credentials SET encrypted_api_key = ${next}, updated_at = NOW()
        WHERE id = ${row.id} AND encrypted_api_key = ${row.encrypted_api_key}
      `;
      rotated += 1;
    }
    process.stdout.write(`Envelope rotation complete. Rotated ${rotated} row(s) to kid=${kid}.\n`);
  });
} finally {
  await sql.end();
}
