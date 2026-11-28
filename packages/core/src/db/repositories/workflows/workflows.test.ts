import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { forecastsTable, transactionsTable } from "../../schema";
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

    // Reject past resolveBy and out-of-range probabilities
    await expect(
      createImmutableForecast(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        thesisId: "thesis-nvda",
        question: "Backdated forecast test",
        probabilities: [0.5, 0.5],
        resolveBy: "2020-01-01",
      }),
    ).rejects.toThrow(/到期日期/);
    await expect(
      createImmutableForecast(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        thesisId: "thesis-nvda",
        question: "Negative prob test",
        probabilities: [1.5, -0.5],
        resolveBy: "2027-06-01",
      }),
    ).rejects.toThrow(/0–1/);

    // Reject out-of-bounds outcomeIndex
    await expect(
      resolveForecast(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        forecastId: created.id,
        outcomeIndex: 5,
      }),
    ).rejects.toThrow(/超出/);

    // Resolving outcome once is permitted
    const resolved = await resolveForecast(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      forecastId: created.id,
      outcomeIndex: 0,
      note: "FY26 毛利率 73.5% 兑现",
    });
    expect(resolved).toBe(true);
    // Re-resolving MUST fail at both repo and DB trigger level
    expect(
      await resolveForecast(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        forecastId: created.id,
        outcomeIndex: 1,
      }),
    ).toBe(false);
    await expect(
      db
        .update(forecastsTable)
        .set({ outcomeJson: { outcomeIndex: 1 } })
        .where(eq(forecastsTable.id, created.id)),
    ).rejects.toThrow();
    // Deleting forecast MUST fail via BEFORE DELETE trigger
    await expect(
      db.delete(forecastsTable).where(eq(forecastsTable.id, created.id)),
    ).rejects.toThrow();

    const all = await listForecasts(db, DEFAULT_WORKSPACE_USER_ID, "thesis-nvda");
    expect(all[0]?.outcomeJson?.outcomeIndex).toBe(0);
  });

  it("W6.1: enforces FIFO lot accounting, DB CHECK constraints, and blocks negative/NaN/margin/short-selling", async () => {
    const acct = await createPortfolioAccount(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      name: "零杠杆实盘账本",
      initialCash: 10_000,
    });

    // Reject negative, zero, and NaN quantities/prices
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
        ticker: "NVDA",
        action: "buy",
        quantity: -100,
        price: 10,
        tradeDate: "2026-01-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/大于 0/);
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
        ticker: "NVDA",
        action: "buy",
        quantity: Number.NaN,
        price: 10,
        tradeDate: "2026-01-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/大于 0/);

    // Direct SQL negative quantity insert MUST be rejected by DB CHECK constraint
    await expect(
      db.insert(transactionsTable).values({
        id: "tx_bad_check",
        accountId: acct.id,
        userId: DEFAULT_WORKSPACE_USER_ID,
        ticker: "NVDA",
        action: "buy",
        quantity: -10,
        price: 100,
        fees: 0,
        tradeDate: "2026-01-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow();

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
  });
});
