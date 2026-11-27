import { normalizeCanonicalTicker, type SecSnapshot, SecSnapshotSchema } from "@kanon/core";
import {
  extractAnnualHistory,
  extractRecentFilings,
  formatUsdCompact,
  resolveCurrencyNormalization,
  type SecFactsPayload,
  summarizeLatestFacts,
} from "./edgar-annuals";
import { extractQuarterlyHistory } from "./edgar-quarterlies";
import { fetchForm4InsiderSummary } from "./form4-parser";
import { type ExtractedPitFact, extractPitFactsFromCompanyFacts } from "./pit/pit-facts-extractor";
import { fetchSecWithRetry } from "./sec-http";
import {
  KNOWN_CIK_MAP,
  SecCompanyFactsSchema,
  SecSubmissionsSchema,
  SecTickerTableSchema,
} from "./xbrl-period-utils";

export { type ExtractedPitFact, extractPitFactsFromCompanyFacts, formatUsdCompact };

const CIK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let dynamicCikCache: { expiresAt: number; map: Map<string, string> } | null = null;
let inflightCikFetch: Promise<Map<string, string> | null> | null = null;

async function loadDynamicCikMap(
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Map<string, string> | null> {
  if (dynamicCikCache && Date.now() < dynamicCikCache.expiresAt) return dynamicCikCache.map;
  if (inflightCikFetch) return inflightCikFetch;
  inflightCikFetch = (async () => {
    const res = await fetchSecWithRetry(
      "https://www.sec.gov/files/company_tickers.json",
      { timeoutMs: 6000, maxRetries: 1, signal },
      fetchImpl,
    );
    if (!res.ok) return null;
    const parsedTable = SecTickerTableSchema.safeParse(await res.json());
    if (!parsedTable.success) return null;
    const map = new Map<string, string>();
    for (const row of Object.values(parsedTable.data)) {
      if (row.ticker && row.cik_str !== undefined) {
        map.set(normalizeCanonicalTicker(row.ticker), String(row.cik_str).padStart(10, "0"));
      }
    }
    dynamicCikCache = { expiresAt: Date.now() + CIK_CACHE_TTL_MS, map };
    return map;
  })().finally(() => {
    inflightCikFetch = null;
  });
  return inflightCikFetch;
}

type CikResolution =
  | { status: "found"; cik: string }
  | { status: "not_found" }
  | { status: "transient_error" };

async function resolveCik(
  ticker: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<CikResolution> {
  const canonical = normalizeCanonicalTicker(ticker);
  if (KNOWN_CIK_MAP[canonical]) return { status: "found", cik: KNOWN_CIK_MAP[canonical] };
  const map = await loadDynamicCikMap(fetchImpl, signal);
  if (!map) return { status: "transient_error" };
  const found = map.get(canonical);
  return found ? { status: "found", cik: found } : { status: "not_found" };
}

export type SecEdgarErrorKind = "not_sec_registrant" | "transient";

export type SecEdgarPitResult =
  | { ok: true; data: SecSnapshot; pitFacts: ExtractedPitFact[] }
  | { ok: false; error: string; errorKind: SecEdgarErrorKind };

async function parseEdgarResponses(subRes: Response, factsRes: Response) {
  if (!subRes.ok) {
    return {
      ok: false as const,
      errorKind: "transient" as const,
      error: `SEC EDGAR 接口返回状态 ${subRes.status}，已保留本地缓存。`,
    };
  }
  const subParsed = SecSubmissionsSchema.safeParse(await subRes.json());
  if (!subParsed.success) {
    return {
      ok: false as const,
      errorKind: "transient" as const,
      error: "SEC EDGAR 披露索引格式异常，已保留本地缓存。",
    };
  }
  if (!factsRes.ok) {
    return {
      ok: false as const,
      errorKind: "transient" as const,
      error: `SEC XBRL 财务数据接口返回状态 ${factsRes.status}，已保留现有缓存。`,
    };
  }
  const factsParsed = SecCompanyFactsSchema.safeParse(await factsRes.json());
  return {
    ok: true as const,
    sub: subParsed.data,
    factsPayload: (factsParsed.success ? factsParsed.data.facts : undefined) as
      | SecFactsPayload
      | undefined,
  };
}

async function buildSnapshotWithPitFromResponses(
  upper: string,
  cik: string,
  subRes: Response,
  factsRes: Response,
  fetchImpl: typeof fetch,
): Promise<SecEdgarPitResult> {
  const parsed = await parseEdgarResponses(subRes, factsRes);
  if (!parsed.ok) return parsed;
  const norm = resolveCurrencyNormalization(parsed.factsPayload, upper);
  const annuals = extractAnnualHistory(parsed.factsPayload, norm);
  const filings = extractRecentFilings(cik, parsed.sub);
  const pitFacts = extractPitFactsFromCompanyFacts(parsed.factsPayload, norm);
  const insiderSummary = await fetchForm4InsiderSummary(filings, fetchImpl).catch(() => null);
  const snapshot = SecSnapshotSchema.parse({
    ticker: upper,
    cik,
    entityName: parsed.sub.name ?? upper,
    source: "sec-edgar-live",
    reportingCurrency: norm.currency,
    fxToUsd: norm.fxToUsd,
    adrRatio: norm.adrRatio,
    fetchedAt: new Date().toISOString(),
    filings,
    facts: summarizeLatestFacts(annuals),
    annuals,
    quarterlies: extractQuarterlyHistory(parsed.factsPayload, norm, annuals),
    insiderSummary,
  });
  return { ok: true, data: snapshot, pitFacts };
}

export async function fetchSecEdgarWithPitFacts(
  ticker: string,
  fetchImpl: typeof fetch = fetch,
  options?: { signal?: AbortSignal },
): Promise<SecEdgarPitResult> {
  const upper = ticker.trim().toUpperCase();
  try {
    const cikRes = await resolveCik(upper, fetchImpl, options?.signal);
    if (cikRes.status === "not_found") {
      return {
        ok: false,
        errorKind: "not_sec_registrant",
        error: `未在 SEC EDGAR 找到代码 ${upper} 对应的 CIK 编号。`,
      };
    }
    if (cikRes.status === "transient_error") {
      return {
        ok: false,
        errorKind: "transient",
        error: `SEC EDGAR CIK 索引暂时不可用，已保留本地缓存。`,
      };
    }
    const opts = { timeoutMs: 7000, maxRetries: 2, signal: options?.signal };
    const [subRes, factsRes] = await Promise.all([
      fetchSecWithRetry(`https://data.sec.gov/submissions/CIK${cikRes.cik}.json`, opts, fetchImpl),
      fetchSecWithRetry(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikRes.cik}.json`,
        opts,
        fetchImpl,
      ),
    ]);
    return buildSnapshotWithPitFromResponses(upper, cikRes.cik, subRes, factsRes, fetchImpl);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 60) : "网络异常";
    return {
      ok: false,
      errorKind: "transient",
      error: `SEC EDGAR 同步失败（${reason}），当前继续使用本地数据库缓存。`,
    };
  }
}

export async function fetchSecEdgarSnapshot(ticker: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchSecEdgarWithPitFacts(ticker, fetchImpl);
  return res.ok ? { ok: true as const, data: res.data } : res;
}
