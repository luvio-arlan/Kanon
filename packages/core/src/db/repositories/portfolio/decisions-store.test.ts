import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { listTheses, updateThesisStep } from "../../index";
import { corporateActionsTable, securitiesTable } from "../../schema";
import {
  createPortfolioAccount,
  recordPortfolioTransaction,
} from "../workflows/portfolio-ledger-store";
import { listDecisionSnapshotsByUser } from "./decision-snapshot-store";
import { listHypothesisStatusEventsByThesisIds } from "./hypothesis-events-store";

async function expectDbTriggerRejection(promise: Promise<unknown>, pattern: RegExp) {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  const msg =
    caught instanceof Error && caught.cause instanceof Error
      ? caught.cause.message
      : String(caught);
  expect(msg).toMatch(pattern);
}

describe("S0/S3 Database Immutability Triggers, Snapshot Locking & Hypothesis Event Log", () => {
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

  it("locks immutable decision_snapshots on buy, enforces thesis access/ticker match, and blocks UPDATE/DELETE via DB trigger", async () => {
    const theses = await listTheses(db);
    const nvda = theses.find((t) => t.ticker === "NVDA");
    expect(nvda).toBeDefined();
    if (!nvda) return;

    const foreignAcct = await createPortfolioAccount(db, {
      userId: "user-outsider-s3",
      name: "外部账户",
      initialCash: 50_000,
      noLeverageConfirmed: true,
    });
    // Cross-tenant thesisId must be rejected with 404 THESIS_NOT_FOUND (Q5-13)
    await expect(
      recordPortfolioTransaction(db, {
        userId: "user-outsider-s3",
        accountId: foreignAcct.id,
        thesisId: nvda.id,
        ticker: "NVDA",
        action: "buy",
        quantity: 5,
        price: 130,
        tradeDate: "2026-01-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "THESIS_NOT_FOUND", status: 404 });

    const acct = await createPortfolioAccount(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      name: "S3 归因账户",
      initialCash: 0,
      noLeverageConfirmed: true,
    });
    const today = new Date().toISOString().slice(0, 10);
    await recordPortfolioTransaction(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      accountId: acct.id,
      ticker: "CASH",
      action: "deposit",
      quantity: 50_000,
      price: 1,
      tradeDate: today,
      noLeverageConfirmed: true,
    });

    // Wrong ticker vs thesisId must be rejected (Q5-13)
    await expect(
      recordPortfolioTransaction(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        accountId: acct.id,
        thesisId: nvda.id,
        ticker: "AAPL",
        action: "buy",
        quantity: 5,
        price: 200,
        tradeDate: today,
        noLeverageConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "THESIS_TICKER_MISMATCH" });

    // Backdated buy before the dated deposit must trigger CASH_PATH_NEGATIVE (S0)
    await expect(
      recordPortfolioTransaction(db, {
        userId: DEFAULT_WORKSPACE_USER_ID,
        accountId: acct.id,
        thesisId: nvda.id,
        ticker: "NVDA",
        action: "buy",
        quantity: 10,
        price: 100,
        tradeDate: "2020-01-01",
        noLeverageConfirmed: true,
      }),
    ).rejects.toMatchObject({ code: "CASH_PATH_NEGATIVE" });

    // Valid buy locks immutable decision snapshot
    const buy = await recordPortfolioTransaction(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      accountId: acct.id,
      thesisId: nvda.id,
      ticker: "NVDA",
      action: "buy",
      quantity: 10,
      price: 130,
      tradeDate: today,
      noLeverageConfirmed: true,
    });
    expect(buy.snapshotHash).toMatch(/^[a-f0-9]{16}$/);

    const snaps = await listDecisionSnapshotsByUser(db, DEFAULT_WORKSPACE_USER_ID);
    expect(snaps.some((s) => s.transactionId === buy.transactionId)).toBe(true);

    // Immutability trigger blocks UPDATE and DELETE on decision_snapshots
    await expectDbTriggerRejection(
      db.execute(
        sql`UPDATE decision_snapshots SET snapshot_hash = 'tampered' WHERE transaction_id = ${buy.transactionId}`,
      ),
      /immutable/i,
    );
    await expectDbTriggerRejection(
      db.execute(sql`DELETE FROM decision_snapshots WHERE transaction_id = ${buy.transactionId}`),
      /immutable/i,
    );
  });

  it("replays corporate_actions 10:1 split on post-split sell and logs append-only hypothesis_status_events", async () => {
    const theses = await listTheses(db);
    const mu = theses.find((t) => t.ticker === "MU");
    expect(mu).toBeDefined();
    if (!mu) return;

    await db
      .insert(securitiesTable)
      .values({ id: "sec-split-test", ticker: "SPLT", name: "Split Corp", currency: "USD" })
      .onConflictDoNothing();
    await db
      .insert(corporateActionsTable)
      .values({
        id: "ca-splt-10",
        securityId: "sec-split-test",
        exDate: "2026-06-10",
        kind: "split",
        ratio: 10,
      })
      .onConflictDoNothing();

    const acct = await createPortfolioAccount(db, {
      userId: "user-split-test",
      name: "拆股重放账户",
      initialCash: 0,
      noLeverageConfirmed: true,
    });
    await recordPortfolioTransaction(db, {
      userId: "user-split-test",
      accountId: acct.id,
      ticker: "CASH",
      action: "deposit",
      quantity: 20_000,
      price: 1,
      tradeDate: "2026-01-01",
      noLeverageConfirmed: true,
    });
    await recordPortfolioTransaction(db, {
      userId: "user-split-test",
      accountId: acct.id,
      ticker: "SPLT",
      action: "buy",
      quantity: 5,
      price: 1000,
      tradeDate: "2026-02-01",
      noLeverageConfirmed: true,
    });
    const sell = await recordPortfolioTransaction(db, {
      userId: "user-split-test",
      accountId: acct.id,
      ticker: "SPLT",
      action: "sell",
      quantity: 30,
      price: 120,
      tradeDate: "2026-06-20",
      noLeverageConfirmed: true,
    });
    expect(sell.realizedPnl).toBe(600);

    const nextHyps = mu.hypotheses.map((h, i) =>
      i === 0 ? { ...h, status: "invalidated" as const } : h,
    );
    await updateThesisStep(db, mu.id, { step: "hypotheses", hypotheses: nextHyps });
    const events = await listHypothesisStatusEventsByThesisIds(db, [mu.id]);
    expect(events.some((e) => e.toStatus === "invalidated" && e.source === "step_edit")).toBe(true);
    await expectDbTriggerRejection(
      db.execute(
        sql`UPDATE hypothesis_status_events SET to_status = 'validated' WHERE thesis_id = ${mu.id}`,
      ),
      /append-only/i,
    );
  });
});
