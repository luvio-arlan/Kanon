import type { SecFilingItem, SecInsiderSignal, SecInsiderSummary, SecInsiderTx } from "@kanon/core";
import { fetchSecWithRetry } from "./sec-http";

const VALID_CODES = new Set(["P", "S", "M", "A", "G"]);

function readXmlTag(xml: string, tag: string): string {
  const withVal = new RegExp(
    `<${tag}\\b[^>]*>[\\s\\S]*?<value>\\s*([^<]+?)\\s*</value>[\\s\\S]*?</${tag}>`,
    "i",
  ).exec(xml);
  if (withVal?.[1]) return withVal[1].trim();
  const direct = new RegExp(`<${tag}\\b[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "i").exec(xml);
  return direct?.[1]?.trim() ?? "";
}

function normalizeForm4XmlUrl(documentUrl: string): string {
  // Strip EDGAR XSLT stylesheet segment e.g. /xslF345X05/form4.xml -> /form4.xml
  return documentUrl.replace(/\/xsl[^/]+\//i, "/");
}

function parseSingleNonDerivBlock(
  block: string,
  meta: { insiderName: string; role: string; filingDate: string; is10b51: boolean },
): SecInsiderTx | null {
  const rawCode = readXmlTag(block, "transactionCode").toUpperCase();
  if (!VALID_CODES.has(rawCode)) return null;
  const shares = Number(readXmlTag(block, "transactionShares"));
  if (!Number.isFinite(shares) || shares <= 0) return null;
  const priceRaw = Number(readXmlTag(block, "transactionPricePerShare"));
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;
  return {
    filingDate: readXmlTag(block, "transactionDate") || meta.filingDate,
    insiderName: meta.insiderName,
    role: meta.role,
    code: rawCode as SecInsiderTx["code"],
    shares: Math.round(shares),
    price,
    valueUsd: price !== null ? Math.round(shares * price) : null,
    is10b51: meta.is10b51,
  };
}

function detect10b51Flag(xml: string): boolean {
  const explicit = /<aff10b5One>\s*([^<\s]+)\s*<\/aff10b5One>/i.exec(xml);
  if (explicit?.[1]) return explicit[1] === "1" || /^true$/i.test(explicit[1]);
  if (/not\s+(?:effected|adopted|made|executed|pursuant)[^.]{0,50}10b5-1/i.test(xml)) {
    return false;
  }
  return /pursuant\s+to\s+(?:a\s+)?(?:rule\s+)?10b5-1/i.test(xml);
}

function parseForm4Transactions(xml: string, filingDate: string): SecInsiderTx[] {
  const insiderName = readXmlTag(xml, "rptOwnerName") || "内部人";
  const officerTitle = readXmlTag(xml, "officerTitle");
  const dirTag = readXmlTag(xml, "isDirector");
  const role =
    officerTitle || (dirTag === "1" || /true/i.test(dirTag) ? "董事" : "持股 10% 以上股东");
  const is10b51 = detect10b51Flag(xml);
  const blocks =
    xml.match(/<nonDerivativeTransaction\b[\s\S]*?<\/nonDerivativeTransaction>/gi) ?? [];
  const meta = { insiderName, role, filingDate, is10b51 };
  return blocks
    .map((b) => parseSingleNonDerivBlock(b, meta))
    .filter((tx): tx is SecInsiderTx => tx !== null);
}

function classifyInsiderSignal(params: {
  buysCount: number;
  buysUsd: number;
  distinctBuyers: number;
  salesCount: number;
  discretionarySalesUsd: number;
  routine10b51Count: number;
}): SecInsiderSignal {
  if (params.distinctBuyers >= 2 || params.buysUsd >= 1_000_000) return "cluster_buy";
  if (params.buysCount > 0 && params.buysUsd > params.discretionarySalesUsd) return "net_buying";
  if (params.salesCount > 0 && params.routine10b51Count / params.salesCount >= 0.8) {
    return "routine_10b51";
  }
  if (params.discretionarySalesUsd >= 1_000_000 && params.buysCount === 0) {
    return "discretionary_selling";
  }
  return "neutral";
}

export function summarizeForm4Transactions(txs: readonly SecInsiderTx[]): SecInsiderSummary {
  const buys = txs.filter((t) => t.code === "P");
  const sales = txs.filter((t) => t.code === "S");
  const routine = sales.filter((t) => t.is10b51);
  const discretionarySales = sales.filter((t) => !t.is10b51);
  const buysUsd = buys.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const salesUsd = sales.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const discSalesUsd = discretionarySales.reduce((s, t) => s + (t.valueUsd ?? 0), 0);
  const distinctBuyers = new Set(buys.map((b) => b.insiderName)).size;

  return {
    openMarketBuysCount: buys.length,
    openMarketBuysUsd: buysUsd,
    openMarketSalesCount: sales.length,
    openMarketSalesUsd: salesUsd,
    routine10b51SalesCount: routine.length,
    signal: classifyInsiderSignal({
      buysCount: buys.length,
      buysUsd,
      distinctBuyers,
      salesCount: sales.length,
      discretionarySalesUsd: discSalesUsd,
      routine10b51Count: routine.length,
    }),
    transactions: [...txs].slice(0, 12),
  };
}

function isSecArchiveUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.origin === "https://www.sec.gov" && parsed.pathname.startsWith("/Archives/edgar/data/")
    );
  } catch (err) {
    void err;
    return false;
  }
}

export async function fetchForm4InsiderSummary(
  filings: readonly SecFilingItem[],
  fetchImpl: typeof fetch,
): Promise<SecInsiderSummary | null> {
  const form4s = filings
    .filter((f) => f.form === "4" && isSecArchiveUrl(f.documentUrl))
    .slice(0, 5);
  if (form4s.length === 0) return null;

  const allTxs: SecInsiderTx[] = [];
  for (let i = 0; i < form4s.length; i += 2) {
    const batch = form4s.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const xmlUrl = normalizeForm4XmlUrl(item.documentUrl);
        const res = await fetchSecWithRetry(
          xmlUrl,
          { accept: "application/xml,text/xml;q=0.9", timeoutMs: 3500, maxRetries: 0 },
          fetchImpl,
        );
        if (!res.ok) return [] as SecInsiderTx[];
        return parseForm4Transactions(await res.text(), item.filingDate);
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") allTxs.push(...r.value);
    }
  }
  return allTxs.length > 0 ? summarizeForm4Transactions(allTxs) : null;
}

export { parseForm4Transactions };
