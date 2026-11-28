import { fetchSecEdgarWithPitFacts, registerSecGlobalSlotAcquirer } from "@kanon/ai";
import { TickerSymbolSchema, UpsertManualSecSnapshotSchema } from "@kanon/core";
import {
  detectFactRestatements,
  getSecSnapshotForUser,
  getSecurityByTicker,
  type KanonDb,
  markSecuritySecStatus,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { withSystemDb } from "../../_lib/db-context";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../_lib/logger";
import {
  acquireSecGlobalSlot,
  checkPersistentRateLimit,
  verifySameOrigin,
} from "../../_lib/request-guards";
import {
  commitSecSnapshotAndWarehouseAtomic,
  drainAlertFanoutJobsBestEffort,
  type PreparedSecCommit,
  prepareSecSnapshotCommit,
} from "../../_lib/sec-warehouse-sync";
import { scheduleBackgroundAfterTask } from "../../internal/jobs/tick/job-once";
import { buildManualFacts, saveManualSecOverride } from "./manual-override";

registerSecGlobalSlotAcquirer((signal) => acquireSecGlobalSlot(signal));

export const dynamic = "force-dynamic";

const SEC_SYNC_RATE_POLICY = { bucket: "sec_sync", maxRequests: 20, windowMs: 60 * 1000 };

interface RouteContext {
  params: Promise<{ ticker: string }>;
}

async function loadTickerRestatements(db: KanonDb, securityId: string | undefined) {
  if (!securityId) return [];
  const list = (
    await Promise.all(
      ["revenue", "net_income", "diluted_eps"].map((concept) =>
        detectFactRestatements(db, { securityId, concept }),
      ),
    )
  ).flat();
  return list
    .filter((r) => r.kind === "restatement")
    .map((r) => ({
      concept: r.concept,
      periodEnd: r.periodEnd,
      originalValue: r.originalValue,
      restatedValue: r.restatedValue,
      restatedAccession: r.restatedAccession,
      kind: r.kind,
    }));
}

export async function GET(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(request, SEC_SYNC_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) {
    return jsonError("无效的证券代码。", 400, startedAt, "INVALID_TICKER");
  }
  const { snapshot, restatements } = await auth.withDb(async (tx) => {
    const [snap, security] = await Promise.all([
      getSecSnapshotForUser(tx, parsedTicker.data, auth.user.id),
      getSecurityByTicker(tx, parsedTicker.data),
    ]);
    const rest = await loadTickerRestatements(tx, security?.id);
    return { snapshot: snap, restatements: rest };
  });
  return jsonOk({ snapshot, restatements }, startedAt);
}

async function commitSecSafely(
  prepared: PreparedSecCommit,
  pitFacts: Parameters<typeof commitSecSnapshotAndWarehouseAtomic>[2],
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  userId: string,
  ticker: string,
  startedAt: number,
) {
  try {
    const saved = await withSystemDb("user_triggered_sync", (tx) =>
      commitSecSnapshotAndWarehouseAtomic(tx, prepared, pitFacts),
    );
    return { saved, warehouseSynced: true as const };
  } catch (err) {
    logStructuredApiEvent({
      level: "warn",
      requestId: generateRequestId(),
      route: `/api/sec/${ticker}`,
      status: 200,
      durationMs: Math.round(performance.now() - startedAt),
      code: "WAREHOUSE_SYNC_FAILED",
      message: err instanceof Error ? err.message : String(err),
    });
    const fallback = await withDb((tx) => getSecSnapshotForUser(tx, ticker, userId));
    return { saved: fallback, warehouseSynced: false as const };
  }
}

async function syncLiveSecAndRespond(
  ticker: string,
  userId: string,
  withDb: <T>(fn: (tx: KanonDb) => Promise<T>) => Promise<T>,
  startedAt: number,
) {
  const fetched = await fetchSecEdgarWithPitFacts(ticker);
  if (!fetched.ok) {
    if (fetched.errorKind === "not_sec_registrant") {
      await withSystemDb("user_triggered_sync", (tx) =>
        markSecuritySecStatus(tx, ticker, "not_registrant"),
      ).catch(() => undefined);
    }
    const snapshot = await withDb((tx) => getSecSnapshotForUser(tx, ticker, userId));
    return jsonOk(
      { snapshot, live: false, warehouseSynced: false, restatements: [], notice: fetched.error },
      startedAt,
    );
  }
  const prepared = prepareSecSnapshotCommit(fetched.data);
  const { saved, warehouseSynced } = await commitSecSafely(
    prepared,
    fetched.pitFacts,
    withDb,
    userId,
    ticker,
    startedAt,
  );
  if (warehouseSynced && prepared.fanout8kJobs.length > 0) {
    scheduleBackgroundAfterTask("/api/sec/[ticker]", () =>
      drainAlertFanoutJobsBestEffort(prepared.fanout8kJobs.length),
    );
  }
  const restatements = await withDb(async (tx) =>
    loadTickerRestatements(tx, (await getSecurityByTicker(tx, ticker))?.id),
  );
  const notice =
    warehouseSynced && saved
      ? `已从 SEC EDGAR 官方接口同步 ${saved.entityName} 最新 10-K/10-Q 与财务锚点。`
      : "SEC 历史仓库写入失败，已原子回滚并保留旧快照。";
  return jsonOk(
    { snapshot: saved, live: warehouseSynced, warehouseSynced, restatements, notice },
    startedAt,
  );
}

export async function POST(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const rateErr = await checkPersistentRateLimit(request, SEC_SYNC_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) return jsonError("无效的证券代码。", 400, startedAt, "INVALID_TICKER");
  return syncLiveSecAndRespond(parsedTicker.data, auth.user.id, auth.withDb, startedAt);
}

export async function PUT(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;
  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) return jsonError("无效的证券代码。", 400, startedAt, "INVALID_TICKER");
  const body = await readJsonBody(request, startedAt);
  if (!body.ok) return body.response;
  const parsed = UpsertManualSecSnapshotSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(
      formatZodError(parsed.error, "手动财报参数不合法。"),
      400,
      startedAt,
      "INVALID",
    );
  }
  const sortedAnnuals = [...parsed.data.annuals].sort((a, b) =>
    a.fiscalYear.localeCompare(b.fiscalYear),
  );
  const manualFacts = buildManualFacts(sortedAnnuals);
  const saved = await auth.withDb((tx) =>
    saveManualSecOverride(
      tx,
      auth.user.id,
      parsedTicker.data,
      parsed.data,
      sortedAnnuals,
      manualFacts,
    ),
  );
  return jsonOk(
    { snapshot: saved, notice: `已保存 ${saved.entityName} 个人核验财务数据` },
    startedAt,
  );
}
