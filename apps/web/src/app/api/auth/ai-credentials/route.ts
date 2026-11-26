import { sanitizeProviderBaseUrl } from "@kanon/ai";
import { ByokProviderSchema } from "@kanon/core";
import {
  deleteUserAiCredential,
  getKanonDb,
  listUserAiCredentials,
  summarizeMonthlyAiUsage,
  upsertUserAiCredential,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonError, jsonOk } from "../../_lib/http";
import { verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

function parseUpsertCredBody(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const providerRes = ByokProviderSchema.safeParse(rec.provider);
  const apiKey = typeof rec.apiKey === "string" ? rec.apiKey.trim() : "";
  if (!providerRes.success || apiKey.length < 8 || apiKey.length > 256) return null;
  const baseUrlRaw = typeof rec.baseUrl === "string" ? rec.baseUrl.trim() : undefined;
  const baseUrl = baseUrlRaw ? sanitizeProviderBaseUrl(baseUrlRaw) : null;
  if (baseUrlRaw && !baseUrl) return null;
  return {
    provider: providerRes.data,
    apiKey,
    label: typeof rec.label === "string" ? rec.label.slice(0, 60) : "",
    baseUrl,
    defaultModel: typeof rec.defaultModel === "string" ? rec.defaultModel.slice(0, 80) : null,
  };
}

export async function GET() {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const db = await getKanonDb();
  const [credentials, monthlyUsage] = await Promise.all([
    listUserAiCredentials(db, auth.user.id),
    summarizeMonthlyAiUsage(db, auth.user.id),
  ]);
  return jsonOk({ credentials, monthlyUsage }, startedAt);
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const parsed = parseUpsertCredBody(await request.json().catch(() => null));
  if (!parsed) {
    return jsonError(
      "请提供合法的 AI 服务商、API Key 及安全 HTTPS 地址。",
      400,
      startedAt,
      "INVALID",
    );
  }
  const db = await getKanonDb();
  const credential = await upsertUserAiCredential(db, {
    userId: auth.user.id,
    ...parsed,
  });
  return jsonOk({ credential }, startedAt, 201);
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const csrfErr = verifySameOrigin(request, startedAt);
  if (csrfErr) return csrfErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  const parsed = ByokProviderSchema.safeParse(provider);
  if (!parsed.success) {
    return jsonError("请提供需删除的 provider。", 400, startedAt, "INVALID");
  }
  const db = await getKanonDb();
  const removed = await deleteUserAiCredential(db, auth.user.id, parsed.data);
  return jsonOk({ ok: true, removed }, startedAt);
}
