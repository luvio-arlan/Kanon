import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { forecastsTable } from "../../schema";
import { parseBrokerCsvTransactions } from "./broker-csv-parser";
import {
  buildCatalystIcsFeed,
  createImmutableForecast,
  createInboxItem,
  issueCalendarToken,
  listForecasts,
  listInboxItems,
  markInboxItemRead,
  resolveForecast,
  upsertAlertRule,
} from "./inbox-and-forecasts-store";
import {
  createPortfolioAccount,
  listPortfolioPositions,
  recordPortfolioTransaction,
} from "./portfolio-ledger-store";

describe("Research Inbox, Immutable Forecasts & Zero-Leverage Portfolio Ledger (Stages 4-6)", () => {
  let db: KanonDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb();
    db = mem.db;
    close = mem.close;
  });

  afterAll(async () => {
    await close();
  });

  it("W4.1-W4.3 & W5.1: manages inbox alerts, ICS calendar feed, and enforces DB-level forecast immutability", async () => {
    await upsertAlertRule(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: "thesis-nvda",
      kind: "price_hurdle",
      configJson: { targetPrice: 120 },
    });
    const itemId = await createInboxItem(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: "thesis-nvda",
      kind: "form8k_redflag",
      severity: "critical",
      title: "NVDA 8-K 重大公告",
      body: "检测到 Item 2.02 业绩披露。",
    });
    expect((await listInboxItems(db, DEFAULT_WORKSPACE_USER_ID)).length).toBeGreaterThanOrEqual(1);
    expect(await markInboxItemRead(db, DEFAULT_WORKSPACE_USER_ID, itemId)).toBe(true);

    const token = await issueCalendarToken(db, DEFAULT_WORKSPACE_USER_ID);
    const ics = await buildCatalystIcsFeed(db, token);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");

    const created = await createImmutableForecast(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: "thesis-nvda",
      question: "NVDA FY26 数据中心毛利率是否维持 70% 以上？",
      forecastKind: "binary",
      probabilities: [0.75, 0.25],
      resolveBy: "2027-02-28",
    });
    expect(created.lockedHash).toHaveLength(64);

    // Direct SQL mutation of locked probabilities MUST fail via Postgres BEFORE UPDATE trigger!
    let tamperErr: unknown = null;
    try {
      await db
        .update(forecastsTable)
        .set({ probabilitiesJson: [0.99, 0.01] })
        .where(eq(forecastsTable.id, created.id));
    } catch (err) {
      tamperErr = err;
    }
    expect(tamperErr).not.toBeNull();
    const causeMsg =
      tamperErr instanceof Error && tamperErr.cause instanceof Error
        ? tamperErr.cause.message
        : String(tamperErr);
    expect(causeMsg).toMatch(/immutable/i);

    // Resolving outcome is permitted
    const resolved = await resolveForecast(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      forecastId: created.id,
      outcomeIndex: 0,
      note: "FY26 毛利率 73.5% 兑现",
    });
    expect(resolved).toBe(true);
    const all = await listForecasts(db, DEFAULT_WORKSPACE_USER_ID, "thesis-nvda");
    expect(all[0]?.outcomeJson?.outcomeIndex).toBe(0);
  });

  it("W6.1: enforces FIFO lot accounting and blocks margin buying & short-selling at backend", async () => {
    const acct = await createPortfolioAccount(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      name: "零杠杆实盘账本",
      initialCash: 10_000,
    });

    // Reject buying beyond cash (no margin/leverage)
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
        ticker: "NVDA",
        action: "buy",
        quantity: 200,
        price: 100,
        tradeDate: "2026-01-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/零杠杆/);

    // Buy two FIFO lots
    await recordPortfolioTransaction(db, {
      accountId: acct.id,
      userId: DEFAULT_WORKSPACE_USER_ID,
      ticker: "NVDA",
      action: "buy",
      quantity: 40,
      price: 100,
      tradeDate: "2026-01-10",
      noLeverageConfirmed: true,
    });
    await recordPortfolioTransaction(db, {
      accountId: acct.id,
      userId: DEFAULT_WORKSPACE_USER_ID,
      ticker: "NVDA",
      action: "buy",
      quantity: 20,
      price: 120,
      tradeDate: "2026-02-10",
      noLeverageConfirmed: true,
    });

    // Sell 50 shares -> consumes 40@$100 + 10@$120 = $5200 cost, proceeds 50*$150 = $7500 -> realized P&L +$2300
    const sellRes = await recordPortfolioTransaction(db, {
      accountId: acct.id,
      userId: DEFAULT_WORKSPACE_USER_ID,
      ticker: "NVDA",
      action: "sell",
      quantity: 50,
      price: 150,
      tradeDate: "2026-03-10",
      noLeverageConfirmed: true,
    });
    expect(sellRes.realizedPnl).toBe(2300);

    const positions = await listPortfolioPositions(db, acct.id);
    expect(positions).toEqual([{ ticker: "NVDA", shares: 10, avgCostBasis: 120, totalCost: 1200 }]);

    // Reject short selling beyond remaining 10 shares
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
        ticker: "NVDA",
        action: "sell",
        quantity: 15,
        price: 150,
        tradeDate: "2026-03-11",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/严禁做空/);

    const parsedCsv = parseBrokerCsvTransactions(
      "date,ticker,action,quantity,price,fees\n2026-01-02,MSFT,buy,10,410,1.5\n",
    );
    expect(parsedCsv).toHaveLength(1);
    expect(parsedCsv[0]?.ticker).toBe("MSFT");
  });
});
