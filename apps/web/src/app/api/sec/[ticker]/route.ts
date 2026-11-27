import {
  fetchSecEdgarWithPitFacts,
  formatUsdCompact,
  registerSecGlobalSlotAcquirer,
} from "@kanon/ai";
import {
  type SecFinancialFact,
  SecSnapshotSchema,
  TickerSymbolSchema,
  UpsertManualSecSnapshotSchema,
} from "@kanon/core";
import {
  detectFactRestatements,
  getKanonDb,
  getSecSnapshot,
  getSecSnapshotForUser,
  getSecurityByTicker,
  markSecuritySecStatus,
  upsertUserSecOverride,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { generateRequestId, logStructuredApiEvent } from "../../_lib/logger";
import {
  acquireSecGlobalSlot,
  checkPersistentRateLimit,
  verifySameOrigin,
} from "../../_lib/request-guards";
import { commitSecSnapshotAndWarehouseAtomic } from "../../_lib/sec-warehouse-sync";

registerSecGlobalSlotAcquirer((signal) => acquireSecGlobalSlot(signal));

export const dynamic = "force-dynamic";

const SEC_SYNC_RATE_POLICY = { bucket: "sec_sync", maxRequests: 20, windowMs: 60 * 1000 };

interface RouteContext {
  params: Promise<{ ticker: string }>;
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
  const db = await getKanonDb();
  const [snapshot, security] = await Promise.all([
    getSecSnapshotForUser(db, parsedTicker.data, auth.user.id),
    getSecurityByTicker(db, parsedTicker.data),
  ]);
  const restatements = await loadTickerRestatements(db, security?.id);
  return jsonOk({ snapshot, restatements }, startedAt);
}

async function loadTickerRestatements(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  securityId: string | undefined,
) {
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

async function commitSecSafely(
  db: Awaited<ReturnType<typeof getKanonDb>>,
  rawSnapshot: Parameters<typeof commitSecSnapshotAndWarehouseAtomic>[1],
  pitFacts: Parameters<typeof commitSecSnapshotAndWarehouseAtomic>[2],
  userId: string,
  ticker: string,
  startedAt: number,
) {
  try {
    const saved = await commitSecSnapshotAndWarehouseAtomic(db, rawSnapshot, pitFacts, userId);
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
    const fallback = await getSecSnapshotForUser(db, ticker, userId);
    return { saved: fallback, warehouseSynced: false as const };
  }
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
  if (!parsedTicker.success) {
    return jsonError("无效的证券代码。", 400, startedAt, "INVALID_TICKER");
  }
  const ticker = parsedTicker.data;
  const db = await getKanonDb();
  const fetched = await fetchSecEdgarWithPitFacts(ticker);
  if (!fetched.ok) {
    if (fetched.errorKind === "not_sec_registrant") {
      await markSecuritySecStatus(db, ticker, "not_registrant").catch(() => undefined);
    }
    const snapshot = await getSecSnapshotForUser(db, ticker, auth.user.id);
    return jsonOk(
      { snapshot, live: false, warehouseSynced: false, restatements: [], notice: fetched.error },
      startedAt,
    );
  }
  const { saved, warehouseSynced } = await commitSecSafely(
    db,
    fetched.data,
    fetched.pitFacts,
    auth.user.id,
    ticker,
    startedAt,
  );
  const restatements = await loadTickerRestatements(
    db,
    (await getSecurityByTicker(db, ticker))?.id,
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

function buildManualFacts(
  annuals: readonly {
    fiscalYear: string;
    revenue: number | null;
    grossProfit: number | null;
    freeCashFlow: number | null;
    netIncome: number | null;
  }[],
): SecFinancialFact[] {
  const latest = annuals[annuals.length - 1];
  if (!latest) return [];
  const specs: Array<[number | null, string, string, string]> = [
    [latest.revenue, "Revenue", "年度营业收入", "manual:Revenue"],
    [latest.grossProfit, "GrossProfit", "年度毛利润", "manual:GrossProfit"],
    latest.freeCashFlow !== null
      ? [latest.freeCashFlow, "FreeCashFlow", "年度自由现金流", "manual:FCF"]
      : [latest.netIncome, "NetIncome", "年度净利润", "manual:NetIncome"],
  ];
  return specs
    .filter((s): s is [number, string, string, string] => s[0] !== null)
    .map(([val, metric, label, sourceTag]) => ({
      metric,
      label,
      valueFormatted: formatUsdCompact(val),
      period: latest.fiscalYear,
      sourceTag,
    }));
}

export async function PUT(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const parsedTicker = TickerSymbolSchema.safeParse((await context.params).ticker);
  if (!parsedTicker.success) {
    return jsonError("无效的证券代码。", 400, startedAt, "INVALID_TICKER");
  }
  const upper = parsedTicker.data;
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
  const db = await getKanonDb();
  const existing = await getSecSnapshot(db, upper);
  const sortedAnnuals = [...parsed.data.annuals].sort((a, b) =>
    a.fiscalYear.localeCompare(b.fiscalYear),
  );
  const snapshot = SecSnapshotSchema.parse({
    ticker: upper,
    cik: existing?.cik ?? `MANUAL-${upper}`,
    entityName: parsed.data.entityName,
    source: "manual-verified",
    reportingCurrency: parsed.data.reportingCurrency,
    fxToUsd: parsed.data.fxToUsd,
    adrRatio: parsed.data.adrRatio,
    fetchedAt: new Date().toISOString(),
    filings: existing?.filings ?? [],
    facts: buildManualFacts(sortedAnnuals),
    annuals: sortedAnnuals,
    quarterlies: existing?.quarterlies ?? [],
    insiderSummary: existing?.insiderSummary ?? null,
  });
  const saved = await upsertUserSecOverride(db, auth.user.id, snapshot);
  return jsonOk(
    { snapshot: saved, notice: `已保存 ${saved.entityName} 个人核验财务数据` },
    startedAt,
  );
}
