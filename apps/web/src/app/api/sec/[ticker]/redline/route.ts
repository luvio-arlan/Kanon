import { type ComparableFilingCandidate, findComparablePriorFiling } from "@kanon/ai";
import {
  FilingRedlineResponseSchema,
  type RedlineSection,
  RedlineSectionSchema,
  TickerSymbolSchema,
} from "@kanon/core";
import {
  enqueueJob,
  getFilingRedline,
  getSecurityByTicker,
  type KanonDb,
  listFilingsBySecurity,
} from "@kanon/core/db";
import { after } from "next/server";
import { requireWorkspaceContext } from "../../../_lib/auth-session";
import { withSystemDb } from "../../../_lib/db-context";
import { jsonError, jsonOk } from "../../../_lib/http";
import { checkPersistentRateLimit } from "../../../_lib/request-guards";
import { runBuildRedlineJob } from "../../../_lib/sec-intel-jobs";

export const dynamic = "force-dynamic";

const REDLINE_RATE_POLICY = { bucket: "sec_redline", maxRequests: 20, windowMs: 60 * 1000 };

function toRef(f: ComparableFilingCandidate) {
  return { accession: f.accession, form: f.form, filedAt: f.filedAt, periodEnd: f.periodEnd };
}

function makeStatusResponse(
  ticker: string,
  status: "no_comparable" | "pending",
  current: ComparableFilingCandidate | null,
  previous: ComparableFilingCandidate | null,
) {
  return FilingRedlineResponseSchema.parse({
    ticker,
    status,
    algoVersion: "redline/1",
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
  const filings = sec ? await listFilingsBySecurity(tx, sec.id, 24) : [];
  const target =
    (requestedAcc ? filings.find((f) => f.accession === requestedAcc) : null) ??
    filings.find((f) => /^(?:10-K|10-Q|20-F)/i.test(f.form)) ??
    null;
  const previous = target ? findComparablePriorFiling({ target, filings, section }) : null;
  if (!target || !previous) return { target, previous: null, cached: null };
  const cached = await getFilingRedline(tx, {
    currentAccession: target.accession,
    previousAccession: previous.accession,
    sectionCode: section,
  });
  return { target, previous, cached };
}

async function enqueueRedlineBuild(ticker: string, accession: string, section: RedlineSection) {
  await withSystemDb("user_triggered_sync", (tx) =>
    enqueueJob(tx, {
      id: `build_redline:${accession}`,
      kind: "build_redline",
      payload: { ticker, accession, section },
      priority: 30,
      maxAttempts: 3,
    }),
  );
  after(() =>
    runBuildRedlineJob({ ticker, accession, section }, "user_triggered_sync").catch(
      () => undefined,
    ),
  );
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
  const requestedAcc = url.searchParams.get("current")?.trim() || null;
  const { target, previous, cached } = await auth.withDb((tx) =>
    resolvePairAndCached(tx, ticker, section, requestedAcc),
  );
  if (!target || !previous) {
    return jsonOk(makeStatusResponse(ticker, "no_comparable", target, null), startedAt);
  }
  if (cached) {
    const body = FilingRedlineResponseSchema.parse({
      ticker,
      status: cached.status,
      algoVersion: "redline/1",
      current: toRef(target),
      previous: toRef(previous),
      stats: cached.stats,
      changes: cached.changes,
    });
    return jsonOk(body, startedAt);
  }
  await enqueueRedlineBuild(ticker, target.accession, section);
  return jsonOk(makeStatusResponse(ticker, "pending", target, previous), startedAt, 202);
}
