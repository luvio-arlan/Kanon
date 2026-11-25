import { type SecFilingItem, type SecSnapshot, SecSnapshotSchema } from "@kanon/core";
import { z } from "zod";
import {
  extractAnnualHistory,
  formatUsdCompact,
  type SecFactsPayload,
  summarizeLatestFacts,
} from "./edgar-annuals";
import { extractQuarterlyHistory } from "./edgar-quarterlies";
import { fetchSecWithRetry } from "./sec-http";

export { formatUsdCompact };

const FINANCIAL_FORMS = new Set(["10-K", "10-Q", "20-F", "DEF 14A"]);
const GOVERNANCE_FORMS = new Set(["8-K", "4"]);

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

const SecTickerRowSchema = z.object({
  ticker: z.string().optional(),
  cik_str: z.union([z.number(), z.string()]).optional(),
});
const SecTickerTableSchema = z.record(z.string(), SecTickerRowSchema);

const SecSubmissionsSchema = z.object({
  name: z.string().optional(),
  filings: z
    .object({
      recent: z
        .object({
          form: z.array(z.string()).optional(),
          filingDate: z.array(z.string()).optional(),
          reportDate: z.array(z.string()).optional(),
          accessionNumber: z.array(z.string()).optional(),
          primaryDocument: z.array(z.string()).optional(),
          primaryDocDescription: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});
type SecSubmissionsResponse = z.infer<typeof SecSubmissionsSchema>;

const SecFactUnitSchema = z.object({
  val: z.number().optional(),
  form: z.string().optional(),
  fy: z.number().optional(),
  fp: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  filed: z.string().optional(),
  frame: z.string().optional(),
});
const SecNamespaceSchema = z.record(
  z.string(),
  z.object({
    units: z
      .object({
        USD: z.array(SecFactUnitSchema).optional(),
        "USD/shares": z.array(SecFactUnitSchema).optional(),
        shares: z.array(SecFactUnitSchema).optional(),
      })
      .optional(),
  }),
);
const SecCompanyFactsSchema = z.object({
  facts: z
    .object({
      "us-gaap": SecNamespaceSchema.optional(),
      "ifrs-full": SecNamespaceSchema.optional(),
    })
    .optional(),
});

const CIK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let dynamicCikCache: { expiresAt: number; map: Map<string, string> } | null = null;

async function resolveCik(ticker: string, fetchImpl: typeof fetch): Promise<string | null> {
  const upper = ticker.trim().toUpperCase();
  if (KNOWN_CIK_MAP[upper]) return KNOWN_CIK_MAP[upper];
  if (dynamicCikCache && Date.now() < dynamicCikCache.expiresAt) {
    return dynamicCikCache.map.get(upper) ?? null;
  }

  const res = await fetchSecWithRetry(
    "https://www.sec.gov/files/company_tickers.json",
    { timeoutMs: 6000, maxRetries: 1 },
    fetchImpl,
  );
  if (!res.ok) return null;
  const rawTable: unknown = await res.json();
  const parsedTable = SecTickerTableSchema.safeParse(rawTable);
  if (!parsedTable.success) return null;
  const map = new Map<string, string>();
  for (const row of Object.values(parsedTable.data)) {
    if (row.ticker && row.cik_str !== undefined) {
      map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
    }
  }
  dynamicCikCache = { expiresAt: Date.now() + CIK_CACHE_TTL_MS, map };
  return map.get(upper) ?? null;
}

function buildFilingItem(
  cik: string,
  cikNumeric: string,
  recent: NonNullable<NonNullable<SecSubmissionsResponse["filings"]>["recent"]>,
  index: number,
): SecFilingItem | null {
  const form = recent.form?.[index] ?? "";
  if (!FINANCIAL_FORMS.has(form) && !GOVERNANCE_FORMS.has(form)) return null;
  const accessionNumber = recent.accessionNumber?.[index] ?? "";
  const primaryDoc = recent.primaryDocument?.[index] ?? "";
  const accClean = accessionNumber.replaceAll("-", "");
  const documentUrl = primaryDoc
    ? `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accClean}/${primaryDoc}`
    : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form}`;
  const defaultDesc = form === "4" ? "Form 4 内部人持股变动" : `${form} 官方披露原文`;
  return {
    form,
    filingDate: recent.filingDate?.[index] ?? "",
    reportDate: recent.reportDate?.[index] ?? "",
    accessionNumber,
    documentUrl,
    description: recent.primaryDocDescription?.[index] || defaultDesc,
  };
}

function pushFilingBucket(
  item: SecFilingItem,
  financial: SecFilingItem[],
  governance: SecFilingItem[],
) {
  if (FINANCIAL_FORMS.has(item.form) && financial.length < 6) {
    financial.push(item);
    return;
  }
  if (GOVERNANCE_FORMS.has(item.form) && governance.length < 4) {
    governance.push(item);
  }
}

function extractRecentFilings(cik: string, data: SecSubmissionsResponse): SecFilingItem[] {
  const recent = data.filings?.recent;
  if (!recent?.form || !recent.filingDate || !recent.accessionNumber) return [];
  const cikNumeric = String(Number(cik));
  const financial: SecFilingItem[] = [];
  const governance: SecFilingItem[] = [];
  for (
    let i = 0;
    i < recent.form.length && (financial.length < 6 || governance.length < 4);
    i += 1
  ) {
    const item = buildFilingItem(cik, cikNumeric, recent, i);
    if (item) pushFilingBucket(item, financial, governance);
  }
  return [...financial, ...governance].sort((a, b) => b.filingDate.localeCompare(a.filingDate));
}

async function buildSnapshotFromResponses(
  upper: string,
  cik: string,
  subRes: Response,
  factsRes: Response,
): Promise<{ ok: true; data: SecSnapshot } | { ok: false; error: string }> {
  if (!subRes.ok) {
    return { ok: false, error: `SEC EDGAR 接口返回状态 ${subRes.status}，已保留本地缓存。` };
  }
  const subParsed = SecSubmissionsSchema.safeParse(await subRes.json());
  if (!subParsed.success) {
    return { ok: false, error: "SEC EDGAR 披露索引格式异常，已保留本地缓存。" };
  }
  const factsParsed = factsRes.ok ? SecCompanyFactsSchema.safeParse(await factsRes.json()) : null;
  const factsPayload: SecFactsPayload | undefined = factsParsed?.success
    ? factsParsed.data.facts
    : undefined;
  const annuals = extractAnnualHistory(factsPayload);
  const snapshot = SecSnapshotSchema.parse({
    ticker: upper,
    cik,
    entityName: subParsed.data.name ?? upper,
    source: "sec-edgar-live",
    fetchedAt: new Date().toISOString(),
    filings: extractRecentFilings(cik, subParsed.data),
    facts: summarizeLatestFacts(annuals),
    annuals,
    quarterlies: extractQuarterlyHistory(factsPayload),
  });
  return { ok: true, data: snapshot };
}

export async function fetchSecEdgarSnapshot(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; data: SecSnapshot } | { ok: false; error: string }> {
  const upper = ticker.trim().toUpperCase();
  try {
    const cik = await resolveCik(upper, fetchImpl);
    if (!cik) return { ok: false, error: `未在 SEC EDGAR 找到代码 ${upper} 对应的 CIK 编号。` };
    const [subRes, factsRes] = await Promise.all([
      fetchSecWithRetry(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { timeoutMs: 7000, maxRetries: 2 },
        fetchImpl,
      ),
      fetchSecWithRetry(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        { timeoutMs: 7000, maxRetries: 2 },
        fetchImpl,
      ),
    ]);
    return buildSnapshotFromResponses(upper, cik, subRes, factsRes);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "网络异常";
    return { ok: false, error: `SEC EDGAR 同步失败（${reason}），当前继续使用本地数据库缓存。` };
  }
}
