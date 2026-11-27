import { fetchSecWithRetry } from "../sec-http";

export const MAX_XBRL_INSTANCE_BYTES = 25 * 1024 * 1024;

export interface XbrlDimension {
  dimension: string;
  member: string;
}

export interface XbrlContext {
  id: string;
  startDate: string | null;
  endDate: string | null;
  dimensions: XbrlDimension[];
}

export interface XbrlFact {
  concept: string;
  contextRef: string;
  unitRef: string;
  value: number;
}

export interface ParsedXbrlInstance {
  status: "ok" | "too_large" | "parse_failed";
  documentPeriodEndDate: string | null;
  contexts: Map<string, XbrlContext>;
  units: Map<string, string>;
  facts: XbrlFact[];
}

const CONTEXT_RE = /<(?:[a-z0-9_-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?context>/gi;
const UNIT_RE = /<(?:[a-z0-9_-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[a-z0-9_-]+:)?unit>/gi;
const MEMBER_RE =
  /<(?:[a-z0-9_-]+:)?explicitMember\b[^>]*dimension=["']([^"']+)["'][^>]*>([^<]+)<\/(?:[a-z0-9_-]+:)?explicitMember>/gi;
const FACT_RE =
  /<([a-z0-9_-]+:[A-Za-z0-9_]+)\b([^>]*\bcontextRef=["'][^"']+["'][^>]*)>([^<]+)<\/\1>/gi;

function readAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}=["']([^"']+)["']`, "i").exec(attrs);
  return m?.[1]?.trim() ?? null;
}

function readTagText(body: string, localName: string): string | null {
  const m = new RegExp(
    `<(?:[a-z0-9_-]+:)?${localName}\\b[^>]*>([^<]+)<\\/(?:[a-z0-9_-]+:)?${localName}>`,
    "i",
  ).exec(body);
  return m?.[1]?.trim() ?? null;
}

function parseContexts(xml: string): Map<string, XbrlContext> {
  const map = new Map<string, XbrlContext>();
  for (const m of xml.matchAll(CONTEXT_RE)) {
    const id = readAttr(m[1] ?? "", "id");
    const body = m[2] ?? "";
    if (!id) continue;
    const startDate = readTagText(body, "startDate");
    const endDate = readTagText(body, "endDate") ?? readTagText(body, "instant");
    const dimensions: XbrlDimension[] = [];
    for (const dm of body.matchAll(MEMBER_RE)) {
      if (dm[1] && dm[2]) dimensions.push({ dimension: dm[1].trim(), member: dm[2].trim() });
    }
    map.set(id, { id, startDate, endDate, dimensions });
  }
  return map;
}

function parseUnits(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of xml.matchAll(UNIT_RE)) {
    const id = readAttr(m[1] ?? "", "id");
    const measure = readTagText(m[2] ?? "", "measure");
    if (!id || !measure) continue;
    const code = measure.includes(":") ? (measure.split(":")[1] ?? measure) : measure;
    map.set(id, code.toUpperCase());
  }
  return map;
}

function isSegmentFactCandidate(concept: string): boolean {
  const local = concept.includes(":") ? (concept.split(":")[1] ?? concept) : concept;
  return /Revenue|Sales|OperatingIncome|OperatingLoss|ProfitLossFromOperating|SegmentProfit|AdjustedOperating|SegmentOperating/i.test(
    local,
  );
}

/** Parses contexts, currency units, and revenue/profit facts from an XBRL instance XML string (R2). */
export function scanXbrlInstanceXml(xml: string): ParsedXbrlInstance {
  if (Buffer.byteLength(xml, "utf8") > MAX_XBRL_INSTANCE_BYTES) {
    return {
      status: "too_large",
      documentPeriodEndDate: null,
      contexts: new Map(),
      units: new Map(),
      facts: [],
    };
  }
  const contexts = parseContexts(xml);
  const units = parseUnits(xml);
  const docPeriod = readTagText(xml, "DocumentPeriodEndDate");
  const facts: XbrlFact[] = [];
  for (const m of xml.matchAll(FACT_RE)) {
    const concept = m[1] ?? "";
    const attrs = m[2] ?? "";
    const rawVal = (m[3] ?? "").trim();
    if (!isSegmentFactCandidate(concept)) continue;
    const contextRef = readAttr(attrs, "contextRef");
    const unitRef = readAttr(attrs, "unitRef") ?? "USD";
    const num = Number(rawVal);
    if (!contextRef || !Number.isFinite(num)) continue;
    facts.push({ concept, contextRef, unitRef, value: num });
  }
  return { status: "ok", documentPeriodEndDate: docPeriod, contexts, units, facts };
}

function makeEmptyInstance(status: "too_large" | "parse_failed"): ParsedXbrlInstance {
  return { status, documentPeriodEndDate: null, contexts: new Map(), units: new Map(), facts: [] };
}

async function readBoundedXmlStream(body: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let xml = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > MAX_XBRL_INSTANCE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    xml += decoder.decode(value, { stream: true });
  }
  return xml + decoder.decode();
}

/** Bounded streaming fetch of an XBRL instance XML file via `fetchSecWithRetry` (<= 25 MB, <= 12 s). */
export async function fetchAndScanXbrlInstance(params: {
  instanceUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ParsedXbrlInstance> {
  const res = await fetchSecWithRetry(
    params.instanceUrl,
    {
      accept: "application/xml,text/xml;q=0.9",
      timeoutMs: 12_000,
      maxRetries: 1,
      signal: params.signal,
    },
    params.fetchImpl ?? fetch,
  );
  if (!res.ok) return makeEmptyInstance("parse_failed");
  const contentLen = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLen) && contentLen > MAX_XBRL_INSTANCE_BYTES) {
    return makeEmptyInstance("too_large");
  }
  if (!res.body) return scanXbrlInstanceXml(await res.text());
  const xml = await readBoundedXmlStream(res.body);
  return xml === null ? makeEmptyInstance("too_large") : scanXbrlInstanceXml(xml);
}
