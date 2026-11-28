import {
  IsoDateSchema,
  SegmentAxisSchema,
  SegmentsPostRequestSchema,
  SegmentsResponseSchema,
  TickerSymbolSchema,
} from "@kanon/core";
import {
  getJobById,
  getSecurityByTicker,
  listLatestSegmentReportsBySecurity,
  listPeriodicFilingsBySecurity,
  selectPrimaryPeriodicFiling,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../../_lib/request-guards";
import { runSyncSegmentsJob } from "../../../_lib/sec-intel-jobs";
import { scheduleJobOnce } from "../../../internal/jobs/tick/job-once";

export const dynamic = "force-dynamic";

const SEGMENTS_RATE_POLICY = { bucket: "sec_segments", maxRequests: 20, windowMs: 60 * 1000 };
const ANNUAL_FORMS = ["10-K", "10-K/A", "20-F", "20-F/A"] as const;
const QUARTER_FORMS = ["10-Q", "10-Q/A"] as const;

async function triggerSegmentSync(ticker: string, accession: string) {
  await scheduleJobOnce({
    id: `sync_segments:${accession}`,
    kind: "sync_segments",
    payload: { ticker, accession },
    priority: 35,
    maxAttempts: 3,
    run: async (signal) => {
      await runSyncSegmentsJob({ ticker, accession }, "user_triggered_sync", signal);
    },
  });
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
  const periodKind = sp.get("period") === "quarter" ? ("quarter" as const) : ("annual" as const);
  return {
    ok: true as const,
    ticker: parsedTicker.data,
    axis: parsedAxis.data,
    periodKind,
    asOf: parsedAsOf?.success ? parsedAsOf.data : undefined,
  };
}

async function loadSegmentsState(
  tx: Parameters<Parameters<typeof import("../../../_lib/db-context").withUserDb>[1]>[0],
  q: {
    ticker: string;
    axis: "business" | "geography" | "product";
    periodKind: "annual" | "quarter";
    asOf?: string;
  },
) {
  const sec = await getSecurityByTicker(tx, q.ticker);
  if (!sec) return { sec: null, reports: [], latestAcc: null, job: null };
  const forms = q.periodKind === "quarter" ? QUARTER_FORMS : ANNUAL_FORMS;
  const [reports, filings] = await Promise.all([
    listLatestSegmentReportsBySecurity(tx, {
      securityId: sec.id,
      axis: q.axis,
      asOf: q.asOf,
      periodKind: q.periodKind,
    }),
    listPeriodicFilingsBySecurity(tx, sec.id, { forms, limit: 16 }),
  ]);
  const latestAcc = selectPrimaryPeriodicFiling(filings)?.accession ?? null;
  const job = latestAcc ? await getJobById(tx, `sync_segments:${latestAcc}`) : null;
  return { sec, reports, latestAcc, job };
}

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, SEGMENTS_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const q = parseSegmentQuery(request, (await context.params).ticker, startedAt);
  if (!q.ok) return q.response;
  const loaded = await auth.withDb((tx) => loadSegmentsState(tx, q));
  if (loaded.reports.length === 0 && loaded.sec?.cik && loaded.latestAcc) {
    if (loaded.job?.status === "failed") {
      return jsonOk(
        SegmentsResponseSchema.parse({ ticker: q.ticker, status: "unavailable", reports: [] }),
        startedAt,
      );
    }
    if (loaded.job?.status !== "pending" && loaded.job?.status !== "running") {
      await triggerSegmentSync(q.ticker, loaded.latestAcc);
    }
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
    const filings = await listPeriodicFilingsBySecurity(tx, sec.id, {
      forms: ANNUAL_FORMS,
      limit: 16,
    });
    return selectPrimaryPeriodicFiling(filings)?.accession ?? null;
  });
  if (!acc) return jsonError("该标的暂无可解析的 SEC 申报文件。", 404, startedAt, "NOT_FOUND");
  await triggerSegmentSync(ticker, acc);
  return jsonOk(
    SegmentsResponseSchema.parse({ ticker, status: "pending", reports: [] }),
    startedAt,
    202,
  );
}
