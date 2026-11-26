import { fetchSecEdgarWithPitFacts, formatUsdCompact } from "@kanon/ai";
import {
  type SecFinancialFact,
  SecSnapshotSchema,
  TickerSymbolSchema,
  UpsertManualSecSnapshotSchema,
} from "@kanon/core";
import {
  getKanonDb,
  getSecSnapshot,
  getSecSnapshotForUser,
  upsertSecSnapshot,
  upsertUserSecOverride,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { formatZodError, jsonError, jsonOk, readJsonBody } from "../../_lib/http";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";
import { syncSecSnapshotToWarehouse } from "../../_lib/sec-warehouse-sync";

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
  const snapshot = await getSecSnapshotForUser(db, parsedTicker.data, auth.user.id);
  return jsonOk({ snapshot }, startedAt);
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

  if (fetched.ok) {
    const saved = await upsertSecSnapshot(db, fetched.data);
    await syncSecSnapshotToWarehouse(db, saved, auth.user.id, fetched.pitFacts).catch(
      () => undefined,
    );
    return jsonOk(
      {
        snapshot: saved,
        live: true,
        notice: `已从 SEC EDGAR 官方接口同步 ${saved.entityName} 最新 10-K/10-Q 与财务锚点。`,
      },
      startedAt,
    );
  }

  const cached = await getSecSnapshotForUser(db, ticker, auth.user.id);
  return jsonOk(
    {
      snapshot: cached,
      live: false,
      notice: fetched.error,
    },
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
  const facts: SecFinancialFact[] = [];
  if (latest.revenue !== null) {
    facts.push({
      metric: "Revenue",
      label: "年度营业收入",
      valueFormatted: formatUsdCompact(latest.revenue),
      period: latest.fiscalYear,
      sourceTag: "manual:Revenue",
    });
  }
  if (latest.grossProfit !== null) {
    facts.push({
      metric: "GrossProfit",
      label: "年度毛利润",
      valueFormatted: formatUsdCompact(latest.grossProfit),
      period: latest.fiscalYear,
      sourceTag: "manual:GrossProfit",
    });
  }
  if (latest.freeCashFlow !== null) {
    facts.push({
      metric: "FreeCashFlow",
      label: "年度自由现金流",
      valueFormatted: formatUsdCompact(latest.freeCashFlow),
      period: latest.fiscalYear,
      sourceTag: "manual:FCF",
    });
  } else if (latest.netIncome !== null) {
    facts.push({
      metric: "NetIncome",
      label: "年度净利润",
      valueFormatted: formatUsdCompact(latest.netIncome),
      period: latest.fiscalYear,
      sourceTag: "manual:NetIncome",
    });
  }
  return facts;
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
