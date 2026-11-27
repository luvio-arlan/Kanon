import {
  IsoDateSchema,
  SegmentAxisSchema,
  SegmentsPostRequestSchema,
  SegmentsResponseSchema,
  TickerSymbolSchema,
} from "@kanon/core";
import {
  enqueueJob,
  getSecurityByTicker,
  listFilingsBySecurity,
  listLatestSegmentReportsBySecurity,
} from "@kanon/core/db";
import { after } from "next/server";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { withSystemDb } from "../../../_lib/db-context";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { runSyncSegmentsJob } from "../../../_lib/sec-intel-jobs";

export const dynamic = "force-dynamic";

const SEGMENTS_RATE_POLICY = { bucket: "sec_segments", maxRequests: 20, windowMs: 60 * 1000 };

async function enqueueSegmentSync(ticker: string, accession: string) {
  await withSystemDb("user_triggered_sync", (tx) =>
    enqueueJob(tx, {
      id: `sync_segments:${accession}`,
      kind: "sync_segments",
      payload: { ticker, accession },
      priority: 35,
      maxAttempts: 3,
    }),
  );
  after(() =>
    runSyncSegmentsJob({ ticker, accession }, "user_triggered_sync").catch(() => undefined),
  );
}

function parseSegmentQuery(request: Request, rawTicker: string, startedAt: number) {
  const parsedTicker = TickerSymbolSchema.safeParse(rawTicker);
  if (!parsedTicker.success) {
    return {
      ok: false as const,
      response: jsonError("股票代码格式不合法。", 400, startedAt, "INVALID"),
    };
  }
  const sp = new URL(request.url).searchParams;
  const parsedAxis = SegmentAxisSchema.safeParse(sp.get("axis") ?? "business");
  if (!parsedAxis.success) {
    return {
      ok: false as const,
      response: jsonError("不支持的分部维度参数。", 400, startedAt, "INVALID"),
    };
  }
  const rawAsOf = sp.get("asOf")?.trim();
  const parsedAsOf = rawAsOf ? IsoDateSchema.safeParse(rawAsOf) : null;
  if (parsedAsOf && !parsedAsOf.success) {
    return {
      ok: false as const,
      response: jsonError("asOf 日期格式需为 YYYY-MM-DD。", 400, startedAt, "INVALID"),
    };
  }
  return {
    ok: true as const,
    ticker: parsedTicker.data,
    axis: parsedAxis.data,
    asOf: parsedAsOf?.success ? parsedAsOf.data : undefined,
  };
}

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, SEGMENTS_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const q = parseSegmentQuery(request, (await context.params).ticker, startedAt);
  if (!q.ok) return q.response;
  const loaded = await auth.withDb(async (tx) => {
    const sec = await getSecurityByTicker(tx, q.ticker);
    if (!sec) return { sec: null, reports: [], latestAcc: null };
    const [reports, filings] = await Promise.all([
      listLatestSegmentReportsBySecurity(tx, { securityId: sec.id, axis: q.axis, asOf: q.asOf }),
      listFilingsBySecurity(tx, sec.id, 12),
    ]);
    return {
      sec,
      reports,
      latestAcc: filings.find((f) => /^(?:10-K|20-F|10-Q)$/i.test(f.form))?.accession ?? null,
    };
  });

  if (loaded.reports.length === 0 && loaded.sec?.cik && loaded.latestAcc) {
    await enqueueSegmentSync(q.ticker, loaded.latestAcc);
    return jsonOk(
      SegmentsResponseSchema.parse({ ticker: q.ticker, status: "pending", reports: [] }),
      startedAt,
      202,
    );
  }
  return jsonOk(
    SegmentsResponseSchema.parse({
      ticker: q.ticker,
      status: loaded.reports.length > 0 ? "ready" : "unavailable",
      reports: loaded.reports,
    }),
    startedAt,
  );
}

export async function POST(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, SEGMENTS_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) return jsonError("股票代码格式不合法。", 400, startedAt, "INVALID");
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = SegmentsPostRequestSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "刷新分部参数不合法。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  const ticker = parsedTicker.data;
  const acc = await auth.withDb(async (tx) => {
    const sec = await getSecurityByTicker(tx, ticker);
    if (!sec?.cik) return null;
    if (parsed.data.accession) return parsed.data.accession;
    const filings = await listFilingsBySecurity(tx, sec.id, 12);
    return filings.find((f) => /^(?:10-K|20-F|10-Q)$/i.test(f.form))?.accession ?? null;
  });
  if (!acc) return jsonError("该标的暂无可解析的 SEC 申报文件。", 404, startedAt, "NOT_FOUND");
  await enqueueSegmentSync(ticker, acc);
  return jsonOk(
    SegmentsResponseSchema.parse({ ticker, status: "pending", reports: [] }),
    startedAt,
    202,
  );
}
