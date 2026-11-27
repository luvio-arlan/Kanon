import {
  type SecFilingItem,
  type SecFilingReaderResponse,
  SecFilingReaderResponseSchema,
  type SecSnapshot,
} from "@kanon/core";
import { extractSecKeySections, stripSecHtmlToParagraphs } from "./filing-text-parser";
import { fetchSecWithRetry } from "./sec-http";

const ALLOWED_SEC_ARCHIVE_PREFIX = "https://www.sec.gov/Archives/edgar/data/";
const MAX_FILING_BYTES = 6_000_000;

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let result = "";

  while (totalBytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    totalBytes += value.byteLength;
    result += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch((err) => {
    void err;
  });
  result += decoder.decode();
  return result;
}

async function fetchSecDocumentHtml(
  documentUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  if (!documentUrl.startsWith(ALLOWED_SEC_ARCHIVE_PREFIX)) {
    return { ok: false, reason: "仅允许拉取 SEC EDGAR 官方 Archives 原文链接。" };
  }
  try {
    const res = await fetchSecWithRetry(
      documentUrl,
      { accept: "text/html,text/plain;q=0.9", timeoutMs: 9000, maxRetries: 1 },
      fetchImpl,
    );
    if (!res.ok) {
      return { ok: false, reason: `SEC 原文接口返回状态 ${res.status}` };
    }
    const html = await readBoundedText(res, MAX_FILING_BYTES);
    return { ok: true, html };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 60) : "网络超时";
    return { ok: false, reason: `拉取 SEC 原文超时或受限（${msg}）` };
  }
}

function selectTargetFiling(
  filings: readonly SecFilingItem[],
  accessionNumber?: string,
  form?: string,
): SecFilingItem | null {
  if (filings.length === 0) return null;
  const byAcc = accessionNumber
    ? filings.find((f) => f.accessionNumber === accessionNumber)
    : undefined;
  const byForm = form
    ? filings.find((f) => f.form.toUpperCase() === form.toUpperCase())
    : filings.find((f) => f.form === "10-K" || f.form === "10-Q" || f.form === "20-F");
  return byAcc ?? byForm ?? filings[0] ?? null;
}

function buildFallbackResponse(
  ticker: string,
  snapshot: SecSnapshot | null,
  target: SecFilingItem | null,
  reason: string,
): SecFilingReaderResponse {
  const factLines = (snapshot?.facts ?? []).map(
    (f) => `${f.label}: ${f.valueFormatted}（披露期 ${f.period}）`,
  );
  const paragraphs =
    factLines.length > 0
      ? [
          `${snapshot?.entityName ?? ticker} 最新已缓存 SEC 财报关键事实摘要：${factLines.join("；")}。`,
          "当前环境暂无法直连 SEC EDGAR 原文服务器，已自动切换为本地已缓存财报事实摘要，也可手动粘贴电话会原文继续精读。",
        ]
      : ["当前未获取到 SEC 原文缓存，请先执行「同步 SEC」或直接粘贴电话会纪要进行划词精读。"];

  return SecFilingReaderResponseSchema.parse({
    ticker: ticker.toUpperCase(),
    form: target?.form ?? "10-K",
    filingDate: target?.filingDate ?? "",
    accessionNumber: target?.accessionNumber ?? "",
    documentUrl: target?.documentUrl ?? "",
    source: "cached-summary",
    sections: [
      {
        id: "cached-summary",
        heading: "已缓存 SEC 财报核心事实",
        category: "general",
        paragraphs,
        signalHits: 0,
      },
    ],
    fullExcerpt: paragraphs.join("\n\n"),
    diff: null,
    notice: `${reason}，已回退至本地缓存摘要。`,
  });
}

function buildLiveFilingPayload(
  upper: string,
  target: SecFilingItem,
  sections: SecFilingReaderResponse["sections"],
): SecFilingReaderResponse {
  const fullExcerpt = sections
    .slice(0, 2)
    .flatMap((s) => [`[${s.heading}]`, ...s.paragraphs.slice(0, 8)])
    .join("\n\n");
  return SecFilingReaderResponseSchema.parse({
    ticker: upper,
    form: target.form,
    filingDate: target.filingDate,
    accessionNumber: target.accessionNumber,
    documentUrl: target.documentUrl,
    source: "sec-edgar-live",
    sections,
    fullExcerpt,
    diff: null,
    notice: `已直拉 ${target.form} (${target.filingDate}) 原文并提取 ${sections.length} 个核心章节`,
  });
}

export async function fetchSecFilingReaderData(params: {
  ticker: string;
  snapshot: SecSnapshot | null;
  accessionNumber?: string;
  form?: string;
  fetchImpl?: typeof fetch;
}): Promise<SecFilingReaderResponse> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const upper = params.ticker.trim().toUpperCase();
  const target = selectTargetFiling(
    params.snapshot?.filings ?? [],
    params.accessionNumber,
    params.form,
  );
  if (!target) {
    return buildFallbackResponse(upper, params.snapshot, null, "尚未缓存该标的的 SEC 披露列表");
  }
  const live = await fetchSecDocumentHtml(target.documentUrl, fetchImpl);
  if (!live.ok) return buildFallbackResponse(upper, params.snapshot, target, live.reason);

  const sections = extractSecKeySections(stripSecHtmlToParagraphs(live.html));
  if (sections.length === 0) {
    return buildFallbackResponse(upper, params.snapshot, target, "原文未解析出有效正文段落");
  }
  return buildLiveFilingPayload(upper, target, sections);
}
