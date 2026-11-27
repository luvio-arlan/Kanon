import { fetchSecWithRetry } from "../sec-http";

export interface FilingIndexUrls {
  instanceUrl: string | null;
  labelLinkbaseUrl: string | null;
}

interface SecIndexItem {
  name?: string;
}

function normalizeCikPath(cik: string): string {
  return String(Number.parseInt(cik, 10));
}

function buildArchiveBaseUrl(cik: string, accession: string): string {
  const cikNum = normalizeCikPath(cik);
  const accClean = accession.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accClean}`;
}

function pickInstanceFilename(names: readonly string[]): string | null {
  const htmXml = names.find((n) => /_htm\.xml$/i.test(n));
  if (htmXml) return htmXml;
  const insXml = names.find(
    (n) =>
      /\.xml$/i.test(n) &&
      !/_(?:cal|def|lab|pre|ref)\.xml$/i.test(n) &&
      !/^FilingSummary\.xml$/i.test(n) &&
      !/^MetaLinks\.json$/i.test(n) &&
      !/^R\d+\.xml$/i.test(n),
  );
  return insXml ?? null;
}

/** Reads SEC filing `index.json` via `fetchSecWithRetry` and locates XBRL instance & label linkbase (R2). */
export async function resolveFilingXbrlUrls(params: {
  cik: string;
  accession: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<FilingIndexUrls> {
  const base = buildArchiveBaseUrl(params.cik, params.accession);
  const res = await fetchSecWithRetry(
    `${base}/index.json`,
    { timeoutMs: 8000, maxRetries: 1, signal: params.signal },
    params.fetchImpl ?? fetch,
  );
  if (!res.ok) return { instanceUrl: null, labelLinkbaseUrl: null };
  const raw: unknown = await res.json();
  const items: SecIndexItem[] =
    raw && typeof raw === "object" && "directory" in raw
      ? ((raw as { directory?: { item?: SecIndexItem[] } }).directory?.item ?? [])
      : [];
  const names = items.map((i) => i.name ?? "").filter(Boolean);
  const instanceName = pickInstanceFilename(names);
  const labelName = names.find((n) => /_lab\.xml$/i.test(n)) ?? null;
  return {
    instanceUrl: instanceName ? `${base}/${instanceName}` : null,
    labelLinkbaseUrl: labelName ? `${base}/${labelName}` : null,
  };
}
