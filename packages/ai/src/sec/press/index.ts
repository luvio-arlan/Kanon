import { readBoundedTextStream } from "../redline/primary-doc";
import { fetchSecWithRetry } from "../sec-http";
import { locateEx991DocumentUrl } from "./exhibit-locator";
import {
  type ExtractedPressGuidanceCandidate,
  extractPressReleaseGuidanceCandidates,
} from "./press-guidance-rules";

export type { ExtractedPressGuidanceCandidate } from "./press-guidance-rules";

const MAX_EX99_1_BYTES = 2 * 1024 * 1024;

/** Fetches 8-K EX-99.1 via SEC gateway and extracts anchored guidance candidates (U1-2 / G13). */
export async function fetchAndExtractPressGuidance(params: {
  cik: string;
  accession: string;
  issuedOn: string;
  signal?: AbortSignal;
}): Promise<{
  exhibitUrl: string | null;
  chunks: Array<{ id: string; paraIndex: number; text: string }>;
  candidates: ExtractedPressGuidanceCandidate[];
}> {
  const exhibitUrl = await locateEx991DocumentUrl(params);
  if (!exhibitUrl) return { exhibitUrl: null, chunks: [], candidates: [] };
  const res = await fetchSecWithRetry(exhibitUrl, {
    signal: params.signal,
    timeoutMs: 15_000,
    maxRetries: 2,
  });
  if (!res.ok) return { exhibitUrl, chunks: [], candidates: [] };
  const bounded = await readBoundedTextStream(res, MAX_EX99_1_BYTES);
  if (bounded.status !== "ok") return { exhibitUrl, chunks: [], candidates: [] };
  const extracted = extractPressReleaseGuidanceCandidates({
    accession: params.accession,
    issuedOn: params.issuedOn,
    html: bounded.text,
  });
  return { exhibitUrl, ...extracted };
}
