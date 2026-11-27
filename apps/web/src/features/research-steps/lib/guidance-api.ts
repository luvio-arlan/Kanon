import {
  type GuidanceLedgerResponse,
  GuidanceLedgerResponseSchema,
  type GuidancePostRequest,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function apiListGuidance(
  thesisId: string,
  signal?: AbortSignal,
): Promise<{ ok: true; data: GuidanceLedgerResponse } | { ok: false; error: string }> {
  const res = await kanonFetch(
    `/api/theses/${encodeURIComponent(thesisId)}/guidance`,
    GuidanceLedgerResponseSchema,
    { signal, fallbackError: "加载指引账本失败" },
  );
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}

export async function apiPostGuidance(
  thesisId: string,
  body: GuidancePostRequest,
): Promise<{ ok: true; data: GuidanceLedgerResponse } | { ok: false; error: string }> {
  const res = await kanonFetch(
    `/api/theses/${encodeURIComponent(thesisId)}/guidance`,
    GuidanceLedgerResponseSchema,
    { method: "POST", body, fallbackError: "更新指引账本失败" },
  );
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}
