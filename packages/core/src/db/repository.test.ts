import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "./client";
import { addDisciplineEntry, deleteThesis } from "./discipline-mutations";
import {
  crossChecksTable,
  disciplineEntriesTable,
  glossaryTermsTable,
  hypothesesTable,
  secFilingsCacheTable,
  thesesTable,
  valuationScenariosTable,
} from "./schema";
import { createThesis, updateThesisStep } from "./thesis-mutations";
import { getSecSnapshot, getThesisById, listGlossaryTerms, listTheses } from "./thesis-queries";

describe("KANON PostgreSQL Repository & DDL Parity", () => {
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

  it("maintains 1:1 DDL column parity with every Drizzle pgTable schema", async () => {
    const tables = [
      thesesTable,
      hypothesesTable,
      crossChecksTable,
      valuationScenariosTable,
      disciplineEntriesTable,
      glossaryTermsTable,
      secFilingsCacheTable,
    ];

    for (const table of tables) {
      const cfg = getTableConfig(table);
      const expectedCols = cfg.columns.map((c) => c.name).sort();
      const result = await db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${cfg.name}`,
      );
      const rawRows = Array.isArray(result) ? result : result.rows;
      const actualCols = rawRows
        .map((row: Record<string, unknown>) => String(row.column_name))
        .sort();
      expect(actualCols, `Table "${cfg.name}" DDL drifted from schema.ts`).toEqual(expectedCols);
    }
  });

  it("seeds MU, NVDA, glossary terms, and baseline SEC snapshots cleanly", async () => {
    const theses = await listTheses(db);
    expect(theses.map((t) => t.ticker)).toEqual(["MU", "NVDA"]);
    expect(theses[0]?.valuation.base.targetPrice).toBe(175);
    expect(theses[1]?.valuation.base.targetPrice).toBe(198.4);

    const glossary = await listGlossaryTerms(db);
    expect(glossary.length).toBeGreaterThanOrEqual(12);

    const muSec = await getSecSnapshot(db, "mu");
    expect(muSec?.cik).toBe("0000723125");
  });

  it("supports full thesis CRUD and live 5-step updates", async () => {
    const created = await createThesis(db, {
      ticker: "msft",
      companyName: "微软",
      sectorTag: "云计算 · 企业 AI",
      currentPrice: 420,
    });
    expect(created.ticker).toBe("MSFT");
    expect(created.indexLabel).toBe("03");

    const updatedVal = await updateThesisStep(db, created.id, {
      step: "valuation",
      valuationInput: {
        currentPrice: 400,
        horizonYears: 3,
        bear: { eps: 13, peMultiple: 24 },
        base: { eps: 18, peMultiple: 30 },
        bull: { eps: 22, peMultiple: 34 },
      },
    });
    expect(updatedVal?.valuation.base.targetPrice).toBe(540);
    expect(updatedVal?.valuation.upsidePct).toBe(35);

    const removed = await deleteThesis(db, created.id);
    expect(removed).toBe(true);
    expect(await getThesisById(db, created.id)).toBeNull();
  });

  it("enforces Zero-Leverage Iron Rule on non-pass discipline entries", async () => {
    await expect(
      addDisciplineEntry(db, "thesis-mu", {
        action: "buy",
        noLeverageConfirmed: false,
        positionCapConfirmed: true,
        exitRule: "跌破毛利红线止损",
        emotion: "fomo",
        priceAnchor: 108,
        note: "试图开两倍杠杆",
      }),
    ).rejects.toThrow(/零杠杆/);

    const valid = await addDisciplineEntry(db, "thesis-mu", {
      action: "add",
      noLeverageConfirmed: true,
      positionCapConfirmed: true,
      exitRule: "HBM 市占低于 20% 退出",
      emotion: "calm",
      priceAnchor: 106,
      note: "严格零杠杆执行",
    });
    expect(valid?.disciplineEntries.length).toBeGreaterThanOrEqual(2);
  });
});
