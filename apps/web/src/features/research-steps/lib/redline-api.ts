import {
  type FilingRedlineResponse,
  FilingRedlineResponseSchema,
  type RedlineSection,
} from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function fetchFilingRedline(params: {
  ticker: string;
  section: RedlineSection;
  current?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; data: FilingRedlineResponse } | { ok: false; error: string }> {
  const qs = new URLSearchParams({ section: params.section });
  if (params.current) qs.set("current", params.current);
  const res = await kanonFetch(
    `/api/sec/${encodeURIComponent(params.ticker)}/redline?${qs}`,
    FilingRedlineResponseSchema,
    { signal: params.signal, fallbackError: "获取跨期对照失败" },
  );
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
}
