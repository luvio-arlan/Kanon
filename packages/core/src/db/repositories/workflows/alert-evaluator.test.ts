import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_USER_ID } from "../../../contracts/auth-contracts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { alertRulesTable, thesesTable } from "../../schema";
import { upsertFinancialFacts } from "../warehouse/facts-pit-store";
import { upsertFiling } from "../warehouse/filings-store";
import { upsertPriceBars } from "../warehouse/price-bars-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import { evaluateAlertRules } from "./alert-evaluator-store";
import {
  createImmutableForecast,
  listInboxItems,
  upsertAlertRule,
} from "./inbox-and-forecasts-store";

describe("Alert rule evaluator (Wave K3)", () => {
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

  it("evaluates price_hurdle, pe_band_breach, forecast_due, and form8k_redflag end-to-end", async () => {
    const [thesis] = await db
      .select()
      .from(thesesTable)
      .where(eq(thesesTable.userId, DEFAULT_WORKSPACE_USER_ID))
      .limit(1);
    expect(thesis).toBeDefined();
    if (!thesis) return;

    const sec = await upsertSecurity(db, { ticker: thesis.ticker, name: thesis.companyName });
    await upsertFiling(db, {
      accession: "0001-26-000888",
      securityId: sec.id,
      cik: "0000001",
      form: "8-K",
      filedAt: "2027-01-05",
      primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/1/8k.htm",
    });
    await upsertFinancialFacts(db, [
      {
        id: "f_eps_eval_1",
        securityId: sec.id,
        accession: "0001-26-000888",
        concept: "diluted_eps",
        xbrlTag: "EarningsPerShareDiluted",
        periodEnd: "2025-12-31",
        duration: "annual",
        value: 2.0,
        unit: "USD/shares",
        filedAt: "2026-01-15",
      },
    ]);
    await upsertPriceBars(
      db,
      Array.from({ length: 25 }, (_, idx) => {
        const px = 20 + idx;
        return {
          securityId: sec.id,
          barDate: `2026-03-${String(idx + 1).padStart(2, "0")}`,
          open: px,
          high: px + 1,
          low: px - 1,
          close: px,
          adjClose: px,
          source: "polygon",
        };
      }),
    );
    await db.update(thesesTable).set({ currentPrice: 90 }).where(eq(thesesTable.id, thesis.id));

    await createImmutableForecast(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: thesis.id,
      question: "K3 到期提醒预测测试",
      probabilities: [0.7, 0.3],
      resolveBy: "2026-12-31",
    });

    const r1 = await upsertAlertRule(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: thesis.id,
      kind: "price_hurdle",
      configJson: { targetPrice: 100, direction: "below" },
    });
    await upsertAlertRule(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: thesis.id,
      kind: "pe_band_breach",
      configJson: {},
    });
    await upsertAlertRule(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: thesis.id,
      kind: "forecast_due",
      configJson: {},
    });
    await upsertAlertRule(db, {
      userId: DEFAULT_WORKSPACE_USER_ID,
      thesisId: thesis.id,
      kind: "form8k_redflag",
      configJson: {},
    });

    const summary = await evaluateAlertRules(db, new Date("2027-01-10T12:00:00Z"));
    expect(summary.evaluatedRules).toBeGreaterThanOrEqual(4);
    expect(summary.triggeredCount).toBe(4);

    const [updatedRule] = await db.select().from(alertRulesTable).where(eq(alertRulesTable.id, r1));
    expect(updatedRule?.lastTriggeredAt).not.toBeNull();

    const items = await listInboxItems(db, DEFAULT_WORKSPACE_USER_ID);
    const kinds = new Set(items.map((i) => i.kind));
    expect(kinds.has("price_hurdle")).toBe(true);
    expect(kinds.has("pe_band_breach")).toBe(true);
    expect(kinds.has("forecast_due")).toBe(true);
    expect(kinds.has("form8k_redflag")).toBe(true);
  });
});
