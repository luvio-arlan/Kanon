import { type SecFilingReaderResponse, SecFilingReaderResponseSchema } from "@kanon/core";
import { kanonFetch } from "@/shared/lib/kanon-fetch";

export async function fetchLiveSecFiling(params: {
  ticker: string;
  accession?: string;
  form?: string;
}): Promise<{ ok: true; data: SecFilingReaderResponse } | { ok: false; error: string }> {
  const qs = new URLSearchParams();
  if (params.accession) qs.set("accession", params.accession);
  if (params.form) qs.set("form", params.form);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return kanonFetch(
    `/api/sec/${encodeURIComponent(params.ticker.toUpperCase())}/filing${suffix}`,
    SecFilingReaderResponseSchema,
  );
}
