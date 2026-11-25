import { fetchMarketQuotes } from "@kanon/ai";
import {
  type MarketQuoteSnapshot,
  RefreshPricesRequestSchema,
  RefreshPricesResponseSchema,
  type ThesisDetail,
} from "@kanon/core";
import {
  batchUpdatePriceAnchors,
  buildMarketQuoteCacheKey,
  getKanonDb,
  listTheses,
  upsertCachedMarketQuotes,
} from "@kanon/core/db";
import { requireWorkspaceContext } from "../../_lib/auth-session";
import { jsonOk } from "../../_lib/http";
import { parseMarketHeaders } from "../../_lib/market-headers";
import { checkPersistentRateLimit, verifySameOrigin } from "../../_lib/request-guards";

export const dynamic = "force-dynamic";

const REFRESH_RATE_POLICY = { bucket: "market_refresh", maxRequests: 20, windowMs: 60 * 1000 };

function formatAnchorLabel(date: Date, mode: "regular" | "extended"): string {
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  return mode === "extended" ? `${md}盘前/后` : `${md}收盘`;
}

function buildRefreshNotice(
  updatedCount: number,
  skippedTickers: readonly string[],
  mode: "regular" | "extended",
): string {
  if (updatedCount === 0) return "外部行情接口暂不可用，已保留全部现有参考价。";
  const skipSuffix = skippedTickers.length > 0 ? `（${skippedTickers.join("/")} 保留原价）` : "";
  const modeLabel = mode === "extended" ? "最新含盘前/盘后价" : "收盘参考价";
  return `已校准 ${updatedCount} 只标的${modeLabel}${skipSuffix}`;
}

async function parseMode(request: Request): Promise<"regular" | "extended"> {
  try {
    const raw: unknown = await request.json();
    const parsed = RefreshPricesRequestSchema.safeParse(raw);
    return parsed.success ? parsed.data.mode : "regular";
  } catch (err) {
    void err;
    return "regular";
  }
}

async function applyMarketQuotes(params: {
  db: Awaited<ReturnType<typeof getKanonDb>>;
  userId: string;
  active: readonly ThesisDetail[];
  rawQuotes: Map<
    string,
    Awaited<ReturnType<typeof fetchMarketQuotes>> extends Map<string, infer V> ? V : never
  >;
  mode: "regular" | "extended";
  label: string;
}) {
  let updatedCount = 0;
  const skippedTickers: string[] = [];
  const quotesRecord: Record<string, MarketQuoteSnapshot> = {};
  const batchEntries: Array<{ thesisId: string; currentPrice: number; label: string }> = [];

  for (const item of params.active) {
    const res = params.rawQuotes.get(item.ticker);
    if (!res?.ok) {
      skippedTickers.push(item.ticker);
      continue;
    }
    quotesRecord[item.ticker] = res.quote;
    const nextPrice =
      params.mode === "extended" ? res.quote.effectivePrice : res.quote.regularPrice;
    if (Math.abs(nextPrice - item.currentPrice) >= 0.01) {
      batchEntries.push({ thesisId: item.id, currentPrice: nextPrice, label: params.label });
    }
    updatedCount += 1;
  }
  const updatedMap = await batchUpdatePriceAnchors(params.db, params.userId, batchEntries);
  return { updatedCount, skippedTickers, updatedMap, quotesRecord };
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const originErr = verifySameOrigin(request, startedAt);
  if (originErr) return originErr;
  const rateErr = await checkPersistentRateLimit(request, REFRESH_RATE_POLICY, startedAt);
  if (rateErr) return rateErr;
  const auth = await requireWorkspaceContext(startedAt);
  if (!auth.ok) return auth.response;

  const mode = await parseMode(request);
  const creds = parseMarketHeaders(request);
  const db = await getKanonDb();
  const all = await listTheses(db, auth.user.id);
  const active = all.filter((item) => item.status === "active");
  const rawQuotes = await fetchMarketQuotes(
    active.map((item) => item.ticker),
    { creds, bypassCache: true },
  );
  const { updatedCount, skippedTickers, updatedMap, quotesRecord } = await applyMarketQuotes({
    db,
    userId: auth.user.id,
    active,
    rawQuotes,
    mode,
    label: formatAnchorLabel(new Date(), mode),
  });
  if (!creds?.apiKey) {
    const providerPref = creds?.provider ?? "auto";
    await upsertCachedMarketQuotes(
      db,
      Object.values(quotesRecord).map((quote) => ({
        cacheKey: buildMarketQuoteCacheKey(quote.ticker, providerPref),
        quote,
      })),
    );
  }

  const updatedTheses = all.map((item) => updatedMap.get(item.id) ?? item);
  return jsonOk(
    RefreshPricesResponseSchema.parse({
      updatedTheses,
      updatedCount,
      skippedTickers,
      sessionMode: mode,
      quotes: quotesRecord,
      notice: buildRefreshNotice(updatedCount, skippedTickers, mode),
    }),
    startedAt,
  );
}
