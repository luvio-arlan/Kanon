export interface MaskedAiCred {
  id: string;
  provider: string;
  keyHint: string;
  label: string;
}

export async function apiLoadSecurityVault() {
  const [tRes, cRes] = await Promise.all([
    fetch("/api/auth/totp").catch(() => null),
    fetch("/api/auth/ai-credentials").catch(() => null),
  ]);
  let totpEnabled = false;
  let credentials: MaskedAiCred[] = [];
  if (tRes?.ok) {
    const raw: unknown = await tRes.json().catch(() => null);
    if (raw && typeof raw === "object") {
      totpEnabled = Boolean((raw as { enabled?: boolean }).enabled);
    }
  }
  if (cRes?.ok) {
    const raw: unknown = await cRes.json().catch(() => null);
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as { credentials?: unknown }).credentials)
    ) {
      credentials = (raw as { credentials: MaskedAiCred[] }).credentials;
    }
  }
  return { totpEnabled, credentials };
}

export async function apiEnrollTotp(): Promise<string | null> {
  const res = await fetch("/api/auth/totp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "enroll" }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const raw: unknown = await res.json().catch(() => null);
  return raw && typeof raw === "object" && typeof (raw as { secret?: unknown }).secret === "string"
    ? (raw as { secret: string }).secret
    : null;
}

export async function apiConfirmTotp(code: string): Promise<boolean> {
  const res = await fetch("/api/auth/totp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "confirm", code }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiSaveVaultCredential(provider: string, apiKey: string): Promise<boolean> {
  const res = await fetch("/api/auth/ai-credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  }).catch(() => null);
  return Boolean(res?.ok);
}

export async function apiDeleteVaultCredential(provider: string): Promise<void> {
  await fetch(`/api/auth/ai-credentials?provider=${encodeURIComponent(provider)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}
