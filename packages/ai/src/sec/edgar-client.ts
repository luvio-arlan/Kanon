import { type SecFilingItem, type SecSnapshot, SecSnapshotSchema } from "@kanon/core";
import { z } from "zod";
import {
  extractAnnualHistory,
  formatUsdCompact,
  resolveCurrencyNormalization,
  type SecFactsPayload,
  summarizeLatestFacts,
} from "./edgar-annuals";
import { extractQuarterlyHistory } from "./edgar-quarterlies";
import { fetchForm4InsiderSummary } from "./form4-parser";
import { type ExtractedPitFact, extractPitFactsFromCompanyFacts } from "./pit/pit-facts-extractor";
import { fetchSecWithRetry } from "./sec-http";
import { KNOWN_CIK_MAP } from "./xbrl-period-utils";

export { type ExtractedPitFact, extractPitFactsFromCompanyFacts, formatUsdCompact };

const FINANCIAL_FORMS = new Set(["10-K", "10-Q", "20-F", "DEF 14A"]);
const GOVERNANCE_FORMS = new Set(["8-K"]);
const FORM4_FORMS = new Set(["4"]);

const SecTickerTableSchema = z.record(
  z.string(),
  z.object({
    ticker: z.string().optional(),
    cik_str: z.union([z.number(), z.string()]).optional(),
  }),
);
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
  accn: z.string().optional(),
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
  z.object({ units: z.record(z.string(), z.array(SecFactUnitSchema).optional()).optional() }),
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
let inflightCikFetch: Promise<Map<string, string> | null> | null = null;

async function loadDynamicCikMap(fetchImpl: typeof fetch): Promise<Map<string, string> | null> {
  if (dynamicCikCache && Date.now() < dynamicCikCache.expiresAt) return dynamicCikCache.map;
  if (inflightCikFetch) return inflightCikFetch;
  inflightCikFetch = (async () => {
    const res = await fetchSecWithRetry(
      "https://www.sec.gov/files/company_tickers.json",
      { timeoutMs: 6000, maxRetries: 1 },
      fetchImpl,
    );
    if (!res.ok) return null;
    const parsedTable = SecTickerTableSchema.safeParse(await res.json());
    if (!parsedTable.success) return null;
    const map = new Map<string, string>();
    for (const row of Object.values(parsedTable.data)) {
      if (row.ticker && row.cik_str !== undefined)
        map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
    }
    dynamicCikCache = { expiresAt: Date.now() + CIK_CACHE_TTL_MS, map };
    return map;
  })().finally(() => {
    inflightCikFetch = null;
  });
  return inflightCikFetch;
}

async function resolveCik(ticker: string, fetchImpl: typeof fetch): Promise<string | null> {
  const upper = ticker.trim().toUpperCase();
  if (KNOWN_CIK_MAP[upper]) return KNOWN_CIK_MAP[upper];
  const map = await loadDynamicCikMap(fetchImpl);
  return map?.get(upper) ?? null;
}

function buildFilingItem(
  cik: string,
  cikNumeric: string,
  recent: NonNullable<NonNullable<SecSubmissionsResponse["filings"]>["recent"]>,
  index: number,
): SecFilingItem | null {
  const form = recent.form?.[index] ?? "";
  if (!FINANCIAL_FORMS.has(form) && !GOVERNANCE_FORMS.has(form) && !FORM4_FORMS.has(form)) {
    return null;
  }
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
  buckets: { financial: SecFilingItem[]; governance: SecFilingItem[]; form4s: SecFilingItem[] },
) {
  if (FINANCIAL_FORMS.has(item.form) && buckets.financial.length < 6) {
    buckets.financial.push(item);
    return;
  }
  if (GOVERNANCE_FORMS.has(item.form) && buckets.governance.length < 4) {
    buckets.governance.push(item);
    return;
  }
  if (FORM4_FORMS.has(item.form) && buckets.form4s.length < 6) {
    buckets.form4s.push(item);
  }
}

function extractRecentFilings(cik: string, data: SecSubmissionsResponse): SecFilingItem[] {
  const recent = data.filings?.recent;
  if (!recent?.form || !recent.filingDate || !recent.accessionNumber) return [];
  const cikNumeric = String(Number(cik));
  const buckets = {
    financial: [] as SecFilingItem[],
    governance: [] as SecFilingItem[],
    form4s: [] as SecFilingItem[],
  };
  for (let i = 0; i < recent.form.length; i += 1) {
    const full =
      buckets.financial.length >= 6 && buckets.governance.length >= 4 && buckets.form4s.length >= 6;
    if (full) break;
    const item = buildFilingItem(cik, cikNumeric, recent, i);
    if (item) pushFilingBucket(item, buckets);
  }
  return [...buckets.financial, ...buckets.governance, ...buckets.form4s].sort((a, b) =>
    b.filingDate.localeCompare(a.filingDate),
  );
}

async function buildSnapshotWithPitFromResponses(
  upper: string,
  cik: string,
  subRes: Response,
  factsRes: Response,
  fetchImpl: typeof fetch,
): Promise<
  { ok: true; data: SecSnapshot; pitFacts: ExtractedPitFact[] } | { ok: false; error: string }
> {
  if (!subRes.ok)
    return { ok: false, error: `SEC EDGAR 接口返回状态 ${subRes.status}，已保留本地缓存。` };
  const subParsed = SecSubmissionsSchema.safeParse(await subRes.json());
  if (!subParsed.success)
    return { ok: false, error: "SEC EDGAR 披露索引格式异常，已保留本地缓存。" };
  if (!factsRes.ok)
    return {
      ok: false,
      error: `SEC XBRL 财务数据接口返回状态 ${factsRes.status}，已保留现有缓存。`,
    };
  const factsParsed = SecCompanyFactsSchema.safeParse(await factsRes.json());
  const factsPayload: SecFactsPayload | undefined = factsParsed.success
    ? factsParsed.data.facts
    : undefined;
  const norm = resolveCurrencyNormalization(factsPayload, upper);
  const annuals = extractAnnualHistory(factsPayload, norm);
  const filings = extractRecentFilings(cik, subParsed.data);
  const pitFacts = extractPitFactsFromCompanyFacts(factsPayload, norm);
  const insiderSummary = await fetchForm4InsiderSummary(filings, fetchImpl).catch(() => null);
  const snapshot = SecSnapshotSchema.parse({
    ticker: upper,
    cik,
    entityName: subParsed.data.name ?? upper,
    source: "sec-edgar-live",
    reportingCurrency: norm.currency,
    fxToUsd: norm.fxToUsd,
    adrRatio: norm.adrRatio,
    fetchedAt: new Date().toISOString(),
    filings,
    facts: summarizeLatestFacts(annuals),
    annuals,
    quarterlies: extractQuarterlyHistory(factsPayload, norm, annuals),
    insiderSummary,
  });
  return { ok: true, data: snapshot, pitFacts };
}

export async function fetchSecEdgarWithPitFacts(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
): Promise<
  { ok: true; data: SecSnapshot; pitFacts: ExtractedPitFact[] } | { ok: false; error: string }
> {
  const upper = ticker.trim().toUpperCase();
  try {
    const cik = await resolveCik(upper, fetchImpl);
    if (!cik) return { ok: false, error: `未在 SEC EDGAR 找到代码 ${upper} 对应的 CIK 编号。` };
    const opts = { timeoutMs: 7000, maxRetries: 2 };
    const [subRes, factsRes] = await Promise.all([
      fetchSecWithRetry(`https://data.sec.gov/submissions/CIK${cik}.json`, opts, fetchImpl),
      fetchSecWithRetry(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
        opts,
        fetchImpl,
      ),
    ]);
    return buildSnapshotWithPitFromResponses(upper, cik, subRes, factsRes, fetchImpl);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "网络异常";
    return { ok: false, error: `SEC EDGAR 同步失败（${reason}），当前继续使用本地数据库缓存。` };
  }
}

export async function fetchSecEdgarSnapshot(ticker: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchSecEdgarWithPitFacts(ticker, fetchImpl);
  return res.ok ? { ok: true as const, data: res.data } : res;
}
