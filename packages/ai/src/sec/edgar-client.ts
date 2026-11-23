import { type SecFilingItem, type SecSnapshot, SecSnapshotSchema } from "@kanon/core";
import {
  extractAnnualHistory,
  formatUsdCompact,
  summarizeLatestFacts,
  type UsGaapFacts,
} from "./edgar-annuals";

export { formatUsdCompact };

const SEC_USER_AGENT = "KANON-Investment-Thesis-OS/1.0 (research@kanon.local)";
const SUPPORTED_FORMS = new Set(["10-K", "10-Q", "20-F"]);

const KNOWN_CIK_MAP: Record<string, string> = {
  MU: "0000723125",
  NVDA: "0001045810",
  TSM: "0001046179",
  AAPL: "0000320193",
  MSFT: "0000789019",
  AMZN: "0001018724",
  GOOGL: "0001652044",
  META: "0001326801",
  AVGO: "0001730168",
  AMD: "0000002488",
  ASML: "0000937966",
  TSLA: "0001318605",
  COST: "0000909832",
};

interface SecSubmissionsResponse {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

interface SecCompanyFactsResponse {
  facts?: { "us-gaap"?: UsGaapFacts };
}

async function resolveCik(ticker: string, fetchImpl: typeof fetch): Promise<string | null> {
  const upper = ticker.trim().toUpperCase();
  if (KNOWN_CIK_MAP[upper]) return KNOWN_CIK_MAP[upper];

  const res = await fetchImpl("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const table = (await res.json()) as Record<string, { ticker?: string; cik_str?: number }>;
  const match = Object.values(table).find((row) => row.ticker?.toUpperCase() === upper);
  return match?.cik_str ? String(match.cik_str).padStart(10, "0") : null;
}

function buildFilingItem(
  cik: string,
  cikNumeric: string,
  recent: NonNullable<NonNullable<SecSubmissionsResponse["filings"]>["recent"]>,
  index: number,
): SecFilingItem | null {
  const form = recent.form?.[index] ?? "";
  if (!SUPPORTED_FORMS.has(form)) return null;
  const accessionNumber = recent.accessionNumber?.[index] ?? "";
  const primaryDoc = recent.primaryDocument?.[index] ?? "";
  const accClean = accessionNumber.replaceAll("-", "");
  const documentUrl = primaryDoc
    ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/${primaryDoc}`
    : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form}`;
  return {
    form,
    filingDate: recent.filingDate?.[index] ?? "",
    reportDate: recent.reportDate?.[index] ?? "",
    accessionNumber,
    documentUrl,
    description: recent.primaryDocDescription?.[index] || `${form} 官方披露原文`,
  };
}

function extractRecentFilings(cik: string, data: SecSubmissionsResponse): SecFilingItem[] {
  const recent = data.filings?.recent;
  if (!recent?.form || !recent.filingDate || !recent.accessionNumber) return [];
  const cikNumeric = String(Number(cik));
  const items: SecFilingItem[] = [];
  for (let i = 0; i < recent.form.length && items.length < 6; i += 1) {
    const item = buildFilingItem(cik, cikNumeric, recent, i);
    if (item) items.push(item);
  }
  return items;
}

export async function fetchSecEdgarSnapshot(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: SecSnapshot } | { ok: false; error: string }> {
  const upper = ticker.trim().toUpperCase();
  try {
    const cik = await resolveCik(upper, fetchImpl);
    if (!cik) return { ok: false, error: `未在 SEC EDGAR 找到代码 ${upper} 对应的 CIK 编号。` };
    const headers = { "User-Agent": SEC_USER_AGENT };
    const [subRes, factsRes] = await Promise.all([
      fetchImpl(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers,
        signal: AbortSignal.timeout(7000),
      }),
      fetchImpl(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
        headers,
        signal: AbortSignal.timeout(7000),
      }),
    ]);
    if (!subRes.ok) {
      return { ok: false, error: `SEC EDGAR 接口返回状态 ${subRes.status}，已保留本地缓存。` };
    }
    const subJson = (await subRes.json()) as SecSubmissionsResponse;
    const factsJson = factsRes.ok ? ((await factsRes.json()) as SecCompanyFactsResponse) : {};
    const annuals = extractAnnualHistory(factsJson.facts?.["us-gaap"]);
    const snapshot = SecSnapshotSchema.parse({
      ticker: upper,
      cik,
      entityName: subJson.name ?? upper,
      source: "sec-edgar-live",
      fetchedAt: new Date().toISOString(),
      filings: extractRecentFilings(cik, subJson),
      facts: summarizeLatestFacts(annuals),
      annuals,
    });
    return { ok: true, data: snapshot };
  } catch {
    return { ok: false, error: "SEC EDGAR 网络超时或受限，当前继续使用本地数据库缓存。" };
  }
}
