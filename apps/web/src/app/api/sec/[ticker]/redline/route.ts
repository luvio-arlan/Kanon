import {
  type ComparableFilingCandidate,
  findComparablePriorFiling,
  REDLINE_ALGO_VERSION,
} from "@kanon/ai";
import {
  FilingRedlineResponseSchema,
  type RedlineSection,
  RedlineSectionSchema,
  TickerSymbolSchema,
} from "@kanon/core";
import {
  getFilingRedline,
  getJobById,
  getSecurityByTicker,
  type KanonDb,
  listPeriodicFilingsBySecurity,
  selectPrimaryPeriodicFiling,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { jsonError, jsonOk } from "../../../_lib/http";
import { checkPersistentRateLimit } from "../../../_lib/request-guards";
import { runBuildRedlineJob } from "../../../_lib/sec-intel-jobs";
import { scheduleJobOnce } from "../../../internal/jobs/tick/job-once";

export const dynamic = "force-dynamic";

const REDLINE_RATE_POLICY = { bucket: "sec_redline", maxRequests: 20, windowMs: 60 * 1000 };

function toRef(f: ComparableFilingCandidate) {
  return { accession: f.accession, form: f.form, filedAt: f.filedAt, periodEnd: f.periodEnd };
}

function makeStatusResponse(
  ticker: string,
  status: "no_comparable" | "pending" | "failed",
  current: ComparableFilingCandidate | null,
  previous: ComparableFilingCandidate | null,
) {
  return FilingRedlineResponseSchema.parse({
    ticker,
    status,
    algoVersion: REDLINE_ALGO_VERSION,
    current: current ? toRef(current) : null,
    previous: previous ? toRef(previous) : null,
    stats: null,
    changes: [],
  });
}

async function resolvePairAndCached(
  tx: KanonDb,
  ticker: string,
  section: RedlineSection,
  requestedAcc: string | null,
) {
  const sec = await getSecurityByTicker(tx, ticker);
  const filings = sec ? await listPeriodicFilingsBySecurity(tx, sec.id, { limit: 32 }) : [];
  const target = selectPrimaryPeriodicFiling(filings, requestedAcc);
  const previous = target ? findComparablePriorFiling({ target, filings, section }) : null;
  if (!target || !previous) return { target, previous: null, cached: null, job: null };
  const jobId = `build_redline:${target.accession}:${section}`;
  const [cached, job] = await Promise.all([
    getFilingRedline(tx, {
      currentAccession: target.accession,
      previousAccession: previous.accession,
      sectionCode: section,
      algoVersion: REDLINE_ALGO_VERSION,
    }),
    getJobById(tx, jobId),
  ]);
  return { target, previous, cached, job };
}

async function scheduleMissingRedline(ticker: string, accession: string, section: RedlineSection) {
  await scheduleJobOnce({
    id: `build_redline:${accession}:${section}`,
    kind: "build_redline",
    payload: { ticker, accession, section },
    priority: 30,
    maxAttempts: 3,
    run: async (signal) => {
      await runBuildRedlineJob({ ticker, accession, section }, "user_triggered_sync", signal);
    },
  });
}

export async function GET(request: Request, context: { params: Promise<{ ticker: string }> }) {
  const startedAt = performance.now();
  const rateErr = await checkPersistentRateLimit(request, REDLINE_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) return jsonError("股票代码格式不合法。", 400, startedAt, "INVALID");
  const url = new URL(request.url);
  const parsedSec = RedlineSectionSchema.safeParse(
    url.searchParams.get("section") ?? "risk_factors",
  );
  if (!parsedSec.success) return jsonError("不支持的年季报章节参数。", 400, startedAt, "INVALID");
  const ticker = parsedTicker.data;
  const section = parsedSec.data;
  const { target, previous, cached, job } = await auth.withDb((tx) =>
    resolvePairAndCached(tx, ticker, section, url.searchParams.get("current")?.trim() || null),
  );
  if (!target || !previous)
    return jsonOk(makeStatusResponse(ticker, "no_comparable", target, null), startedAt);
  if (cached) {
    const body = FilingRedlineResponseSchema.parse({
      ticker,
      status: cached.status,
      algoVersion: cached.algoVersion,
      current: toRef(target),
      previous: toRef(previous),
      stats: cached.stats,
      changes: cached.changes,
    });
    return jsonOk(body, startedAt);
  }
  if (job?.status === "failed")
    return jsonOk(makeStatusResponse(ticker, "failed", target, previous), startedAt);
  if (job?.status !== "pending" && job?.status !== "running") {
    await scheduleMissingRedline(ticker, target.accession, section);
  }
  return jsonOk(makeStatusResponse(ticker, "pending", target, previous), startedAt, 202);
}
