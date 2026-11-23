import {
  type SecFilingItem,
  type SecFinancialFact,
  type SecSnapshot,
  SecSnapshotSchema,
} from "@kanon/core";

const SEC_USER_AGENT = "KANON-Investment-Thesis-OS/1.0 (research@kanon.local)";

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

interface SecFactUnit {
  val?: number;
  form?: string;
  fy?: number;
  fp?: string;
  end?: string;
}

interface SecCompanyFactsResponse {
  facts?: {
    "us-gaap"?: Record<string, { units?: { USD?: SecFactUnit[] } }>;
  };
}

export function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

async function resolveCik(ticker: string, fetchImpl: typeof fetch): Promise<string | null> {
  const upper = ticker.trim().toUpperCase();
  const known = KNOWN_CIK_MAP[upper];
  if (known) return known;

  const res = await fetchImpl("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": SEC_USER_AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const table = (await res.json()) as Record<string, { ticker?: string; cik_str?: number }>;
  const match = Object.values(table).find((row) => row.ticker?.toUpperCase() === upper);
  if (!match?.cik_str) return null;
  return String(match.cik_str).padStart(10, "0");
}

const SUPPORTED_FORMS = new Set(["10-K", "10-Q", "20-F"]);

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

function pickLatestAnnualFact(
  gaap: Record<string, { units?: { USD?: SecFactUnit[] } }> | undefined,
  tags: readonly string[],
  metric: string,
  label: string,
): SecFinancialFact | null {
  if (!gaap) return null;
  for (const tag of tags) {
    const units = gaap[tag]?.units?.USD;
    if (!units || units.length === 0) continue;
    const annual = units
      .filter((u) => (u.form === "10-K" || u.form === "20-F") && typeof u.val === "number")
      .sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""));
    const latest = annual[0];
    if (!latest || typeof latest.val !== "number") continue;
    return {
      metric,
      label,
      valueFormatted: formatUsdCompact(latest.val),
      period: latest.fy ? `FY${latest.fy}` : (latest.end?.slice(0, 4) ?? "最新财年"),
      sourceTag: `us-gaap:${tag}`,
    };
  }
  return null;
}

function extractFacts(factsData: SecCompanyFactsResponse): SecFinancialFact[] {
  const gaap = factsData.facts?.["us-gaap"];
  const candidates = [
    pickLatestAnnualFact(
      gaap,
      ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
      "Revenue",
      "年度营业收入",
    ),
    pickLatestAnnualFact(gaap, ["GrossProfit"], "GrossProfit", "年度毛利润"),
    pickLatestAnnualFact(gaap, ["NetIncomeLoss"], "NetIncome", "年度净利润"),
    pickLatestAnnualFact(
      gaap,
      ["NetCashProvidedByUsedInOperatingActivities"],
      "OperatingCashFlow",
      "经营性现金流",
    ),
  ];
  return candidates.filter((item): item is SecFinancialFact => item !== null);
}

export async function fetchSecEdgarSnapshot(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: SecSnapshot } | { ok: false; error: string }> {
  const upper = ticker.trim().toUpperCase();
  try {
    const cik = await resolveCik(upper, fetchImpl);
    if (!cik) {
      return { ok: false, error: `未在 SEC EDGAR 找到代码 ${upper} 对应的 CIK 编号。` };
    }
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
    const snapshot = SecSnapshotSchema.parse({
      ticker: upper,
      cik,
      entityName: subJson.name ?? upper,
      source: "sec-edgar-live",
      fetchedAt: new Date().toISOString(),
      filings: extractRecentFilings(cik, subJson),
      facts: extractFacts(factsJson),
    });
    return { ok: true, data: snapshot };
  } catch {
    return { ok: false, error: "SEC EDGAR 网络超时或受限，当前继续使用本地数据库缓存。" };
  }
}
