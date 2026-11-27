import type { SegmentAxis } from "@kanon/core";
import { fetchSecWithRetry } from "../sec-http";
import { resolveFilingXbrlUrls } from "./filing-index";
import { parseLabelLinkbaseXml } from "./member-labels";
import { type ExtractedAxisReport, extractAxisReport } from "./segment-extract";
import { fetchAndScanXbrlInstance, scanXbrlInstanceXml } from "./xbrl-instance-scan";

export { type ExtractedAxisReport, extractAxisReport, parseLabelLinkbaseXml, scanXbrlInstanceXml };

export interface ExtractSegmentReportsResult {
  status: "ok" | "no_dimensional_data" | "too_large" | "parse_failed";
  reports: ExtractedAxisReport[];
}

/** Fetches SEC filing XBRL instance + label linkbase and extracts reconciled business & geography reports (R2). */
export async function extractSegmentReports(params: {
  cik: string;
  accession: string;
  form: string;
  axes?: readonly SegmentAxis[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ExtractSegmentReportsResult> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const urls = await resolveFilingXbrlUrls({
    cik: params.cik,
    accession: params.accession,
    fetchImpl,
    signal: params.signal,
  });
  if (!urls.instanceUrl) return { status: "no_dimensional_data", reports: [] };

  const parsed = await fetchAndScanXbrlInstance({
    instanceUrl: urls.instanceUrl,
    fetchImpl,
    signal: params.signal,
  });
  if (parsed.status === "too_large") return { status: "too_large", reports: [] };
  if (parsed.status === "parse_failed") return { status: "parse_failed", reports: [] };

  let labels = new Map<string, string>();
  if (urls.labelLinkbaseUrl) {
    const labRes = await fetchSecWithRetry(
      urls.labelLinkbaseUrl,
      { timeoutMs: 6000, maxRetries: 1, signal: params.signal },
      fetchImpl,
    ).catch(() => null);
    if (labRes?.ok) labels = parseLabelLinkbaseXml(await labRes.text());
  }

  const axes = params.axes ?? (["business", "geography"] as const);
  const reports: ExtractedAxisReport[] = [];
  for (const axis of axes) {
    const rep = extractAxisReport({ parsed, axis, form: params.form, linkbaseLabels: labels });
    if (rep) reports.push(rep);
  }
  return reports.length > 0
    ? { status: "ok", reports }
    : { status: "no_dimensional_data", reports: [] };
}
