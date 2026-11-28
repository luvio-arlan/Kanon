import {
  PortfolioAttributionResponseSchema,
  PortfolioPerformanceResponseSchema,
  PortfolioRiskResponseSchema,
} from "@kanon/core";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { createAuthenticatedContext, GOLDEN_ACTORS } from "../support/actors";
import {
  ErrorCodeResponseSchema,
  LedgerAccountCreateResponseSchema,
  parseApiResponse,
} from "../support/contracts";
import { readSharedState, todayIsoUtc } from "../support/fixtures";

async function createCashAccount(req: APIRequestContext): Promise<string> {
  const res = await req.post("/api/portfolio/ledger", {
    data: {
      op: "create_account",
      name: "主投研账本",
      baseCurrency: "USD",
      initialCash: 10_000,
      noLeverageConfirmed: true,
    },
  });
  expect(res.status()).toBe(201);
  return (await parseApiResponse(res, LedgerAccountCreateResponseSchema, "create account")).account
    .id;
}

async function verifyZeroLeverageRejections(
  req: APIRequestContext,
  accountId: string,
  today: string,
) {
  const overBuy = await req.post("/api/portfolio/ledger", {
    data: {
      op: "record_transaction",
      accountId,
      ticker: "NVDA",
      action: "buy",
      quantity: 200,
      price: 135,
      fees: 0,
      tradeDate: today,
      noLeverageConfirmed: true,
    },
  });
  expect(overBuy.status()).toBe(400);
  expect((await parseApiResponse(overBuy, ErrorCodeResponseSchema, "overBuy")).code).toBe(
    "INSUFFICIENT_CASH",
  );

  const overSell = await req.post("/api/portfolio/ledger", {
    data: {
      op: "record_transaction",
      accountId,
      ticker: "NVDA",
      action: "sell",
      quantity: 25,
      price: 140,
      fees: 0,
      tradeDate: today,
      noLeverageConfirmed: true,
    },
  });
  expect(overSell.status()).toBe(400);
  expect((await parseApiResponse(overSell, ErrorCodeResponseSchema, "overSell")).code).toBe(
    "SHORT_SELL_BLOCKED",
  );
}

async function verifyBackdatedCashPathRejection(
  req: APIRequestContext,
  accountId: string,
  today: string,
) {
  // Deposit $10,000 today (raising current cash to $18,650), then attempt a $12,000 backdated buy on 2025-01-01
  // when historical cash was only $10,000 -> MUST be blocked with CASH_PATH_NEGATIVE even though current cash suffices.
  const dep = await req.post("/api/portfolio/ledger", {
    data: {
      op: "record_transaction",
      accountId,
      ticker: "CASH",
      action: "deposit",
      quantity: 10_000,
      price: 1,
      fees: 0,
      tradeDate: today,
      noLeverageConfirmed: true,
    },
  });
  expect(dep.status()).toBe(201);

  const backdatedBuy = await req.post("/api/portfolio/ledger", {
    data: {
      op: "record_transaction",
      accountId,
      ticker: "NVDA",
      action: "buy",
      quantity: 120,
      price: 100,
      fees: 0,
      tradeDate: "2025-01-01",
      noLeverageConfirmed: true,
    },
  });
  expect(backdatedBuy.status()).toBe(400);
  expect((await parseApiResponse(backdatedBuy, ErrorCodeResponseSchema, "backdatedBuy")).code).toBe(
    "CASH_PATH_NEGATIVE",
  );
}

async function verifyWaveSAnalyticsEndpoints(req: APIRequestContext, accountId: string) {
  const [perfRes, riskRes, attrRes] = await Promise.all([
    req.get(`/api/portfolio/performance?accountId=${encodeURIComponent(accountId)}`),
    req.get("/api/portfolio/risk"),
    req.get(`/api/portfolio/attribution?accountId=${encodeURIComponent(accountId)}`),
  ]);
  expect(perfRes.status()).toBe(200);
  const perf = await parseApiResponse(perfRes, PortfolioPerformanceResponseSchema, "perf");
  expect(perf.status).toBe("ready");
  expect(perf.totalNav).toBeGreaterThan(0);

  expect(riskRes.status()).toBe(200);
  const risk = await parseApiResponse(riskRes, PortfolioRiskResponseSchema, "risk");
  expect(["ledger_daily_cov", "insufficient_history"]).toContain(risk.basis);
  expect(risk.clusterCapPct).toBe(35);

  expect(attrRes.status()).toBe(200);
  const attr = await parseApiResponse(attrRes, PortfolioAttributionResponseSchema, "attr");
  expect(attr.status).toBe("ready");
  expect(attr.episodes.some((e) => e.ticker === "NVDA" && Boolean(e.snapshotHash))).toBe(true);
}

test.describe
  .serial("07 · Zero-Leverage Portfolio Ledger Guards", () => {
    test("creates $10,000 cash account, records buy, and blocks over-cash & short sell", async ({
      browser,
      baseURL,
    }) => {
      if (!baseURL) throw new Error("baseURL required");
      const thesisId = readSharedState().nvdaThesisId;
      const { context } = await createAuthenticatedContext(browser, baseURL, GOLDEN_ACTORS.owner);
      const req = context.request;
      const accountId = await createCashAccount(req);
      const today = todayIsoUtc();

      const buyOk = await req.post("/api/portfolio/ledger", {
        data: {
          op: "record_transaction",
          accountId,
          thesisId,
          ticker: "NVDA",
          action: "buy",
          quantity: 10,
          price: 135,
          fees: 0,
          tradeDate: today,
          noLeverageConfirmed: true,
        },
      });
      expect(buyOk.status()).toBe(201);
      await verifyZeroLeverageRejections(req, accountId, today);
      await verifyBackdatedCashPathRejection(req, accountId, today);
      await verifyWaveSAnalyticsEndpoints(req, accountId);
      await context.close();
    });
  });
