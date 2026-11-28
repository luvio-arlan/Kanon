import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { KANON_WAVE_V0_NUMERIC_EXCHANGE_REFLAG_SQL } from "../../migrations/v4/0039-numeric-exchange-currency-reflag";
import { portfolioAccountsTable, transactionsTable } from "../../schema";
import { loadPortfolioAnalyticsContext } from "../portfolio/analytics-context-store";
import { findFxBackfillStart } from "../portfolio/fx-coverage-store";
import { upsertFxRates } from "../warehouse/securities-and-fx-store";
import { confirmLegacyAccountCurrency } from "./ledger-legacy-confirm";
import { createPortfolioAccount, recordPortfolioTransaction } from "./portfolio-ledger-store";

const USER = DEFAULT_WORKSPACE_USER_ID;
const HKD_USD = 0.128;

async function expectLedgerError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe("V0-2 / V0-4 multi-currency ledger honesty (G35)", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb();
    db = mem.db;
    close = mem.close;
    await upsertFxRates(db, [
      { currency: "HKD", rateDate: "2025-01-02", usdPerUnit: HKD_USD },
      { currency: "HKD", rateDate: "2025-06-02", usdPerUnit: HKD_USD },
    ]);
  });

  afterAll(async () => {
    await close();
  });

  it("findFxBackfillStart asks for history before the earliest rate and for stale tails, never interpolates", async () => {
    const today = "2025-06-04";
    expect(
      await findFxBackfillStart(db, { currencies: ["HKD"], fromDate: "2025-03-01", today }),
    ).toBeNull();
    expect(
      await findFxBackfillStart(db, { currencies: ["HKD"], fromDate: "2024-06-01", today }),
    ).toBe("2024-05-22");
    expect(
      await findFxBackfillStart(db, {
        currencies: ["HKD"],
        fromDate: "2025-03-01",
        today: "2025-07-01",
      }),
    ).toBe("2025-06-02");
    expect(
      await findFxBackfillStart(db, { currencies: ["JPY"], fromDate: "1990-01-01", today }),
    ).toBe("1999-01-04");
    expect(
      await findFxBackfillStart(db, { currencies: ["USD"], fromDate: "2020-01-01", today }),
    ).toBeNull();
  });

  it("rejects non-identity FX on same-currency trades and broker rates >3% off ECB unless acknowledged", async () => {
    const { id: accountId } = await createPortfolioAccount(db, {
      userId: USER,
      name: "USD",
      initialCash: 100_000,
    });
    const base = {
      accountId,
      userId: USER,
      action: "buy" as const,
      quantity: 10,
      price: 100,
      tradeDate: "2025-06-03",
      noLeverageConfirmed: true,
    };
    await expectLedgerError(
      recordPortfolioTransaction(db, { ...base, ticker: "AAPL", fxToBase: 7.8 }),
      "FX_IDENTITY_MISMATCH",
    );
    await expectLedgerError(
      recordPortfolioTransaction(db, { ...base, ticker: "0700.HK", fxToBase: 0.2 }),
      "FX_DEVIATION",
    );
    await recordPortfolioTransaction(db, {
      ...base,
      ticker: "0700.HK",
      fxToBase: 0.2,
      fxDeviationAck: true,
    });
    const ecb = await recordPortfolioTransaction(db, { ...base, ticker: "0700.HK" });
    const [row] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, ecb.transactionId));
    expect(row?.tradeCurrency).toBe("HKD");
    expect(row?.fxSource).toBe("ecb_reference");
    expect(row?.fxToBase).toBeCloseTo(HKD_USD, 9);
  });

  it("gates legacy NULL-currency accounts until the owner confirms, then clears the flag exactly once", async () => {
    const { id: accountId } = await createPortfolioAccount(db, {
      userId: USER,
      name: "Legacy",
      initialCash: 100_000,
    });
    // Exact production legacy shape: canonical `0700-HK`, back-filled by 0035 as USD × 1 identity.
    await db.insert(transactionsTable).values({
      id: "tx_legacy_hk",
      accountId,
      userId: USER,
      ticker: "0700-HK",
      action: "buy",
      quantity: 100,
      price: 380,
      fees: 0,
      tradeDate: "2025-06-02",
      tradeCurrency: "USD",
      fxToBase: 1,
      fxSource: "identity",
      noLeverageConfirmed: true,
      note: "",
    });
    await db.execute(sql.raw(KANON_WAVE_V0_NUMERIC_EXCHANGE_REFLAG_SQL));
    const [flagged] = await db
      .select({ flag: portfolioAccountsTable.ledgerInconsistent })
      .from(portfolioAccountsTable)
      .where(eq(portfolioAccountsTable.id, accountId));
    expect(flagged?.flag).toBe(true);

    const ctx = await loadPortfolioAnalyticsContext(db, { userId: USER, accountId });
    expect(ctx.kind).toBe("currency_unconfirmed");
    await expectLedgerError(
      recordPortfolioTransaction(db, {
        accountId,
        userId: USER,
        ticker: "AAPL",
        action: "buy",
        quantity: 1,
        price: 100,
        tradeDate: "2025-06-03",
        noLeverageConfirmed: true,
      }),
      "CURRENCY_UNCONFIRMED",
    );

    const result = await confirmLegacyAccountCurrency(db, {
      accountId,
      userId: USER,
      mode: "infer_by_ticker",
    });
    expect(result.updatedTransactions).toBe(1);
    expect(result.cashBalance).toBeCloseTo(100_000 - 100 * 380 * HKD_USD, 2);
    const [legacy] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, "tx_legacy_hk"));
    expect(legacy?.tradeCurrency).toBe("HKD");
    expect(legacy?.fxToBase).toBeCloseTo(HKD_USD, 9);
    expect((await loadPortfolioAnalyticsContext(db, { userId: USER, accountId })).kind).toBe(
      "ready",
    );
    await expectLedgerError(
      confirmLegacyAccountCurrency(db, { accountId, userId: USER, mode: "as_base" }),
      "ALREADY_CONFIRMED",
    );
  });
});
