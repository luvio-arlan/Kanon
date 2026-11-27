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
      await context.close();
    });
  });
