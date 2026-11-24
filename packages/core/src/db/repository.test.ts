import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateResearchReadiness } from "../math/research-readiness";
import { calculateSensitivityMatrix } from "../math/sensitivity-matrix";
import { createMemoryKanonDb, getDbHealthStats, type KanonDb } from "./client";
import { listCopilotOutputs, upsertCopilotOutput } from "./copilot-store";
import { addDisciplineEntry, deleteThesis } from "./discipline-mutations";
import { listThesisRevisions } from "./revision-queries";
import {
  copilotOutputsTable,
  crossChecksTable,
  disciplineEntriesTable,
  glossaryTermsTable,
  hypothesesTable,
  secFilingsCacheTable,
  thesesTable,
  thesisRevisionsTable,
  valuationScenariosTable,
} from "./schema";
import { createThesis, updateThesisStep } from "./thesis-mutations";
import {
  getSecSnapshot,
  getThesisById,
  listGlossaryTerms,
  listTheses,
  listThesisSummaries,
} from "./thesis-queries";

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
      copilotOutputsTable,
      thesisRevisionsTable,
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

    const summaries = await listThesisSummaries(db);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.baseTargetPrice).toBe(175);
    expect(theses[0]?.businessFilter.variantPerception.length).toBeGreaterThan(10);
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

    const calibrated = await updateThesisStep(db, created.id, {
      step: "price_anchor",
      currentPrice: 390,
    });
    expect(calibrated?.currentPrice).toBe(390);

    const revisions = await listThesisRevisions(db, created.id);
    expect(revisions.length).toBeGreaterThanOrEqual(3);
    expect(revisions[0]?.step).toBe("price_anchor");

    const health = await getDbHealthStats(db);
    expect(health.engine).toBe("pglite-embedded");
    expect(health.secCachedCount).toBeGreaterThanOrEqual(4);

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

  it("persists copilot outputs, evaluates readiness, and builds 5x5 sensitivity matrix", async () => {
    const saved = await upsertCopilotOutput(db, "thesis-mu", {
      action: "red_team",
      engine: "grounded-local",
      payload: { ticker: "MU", challenges: [] },
    });
    expect(saved.action).toBe("red_team");

    const list = await listCopilotOutputs(db, "thesis-mu");
    expect(list.some((item) => item.action === "red_team")).toBe(true);

    const mu = await getThesisById(db, "thesis-mu");
    expect(mu).not.toBeNull();
    if (!mu) return;

    const readiness = calculateResearchReadiness(mu);
    expect(readiness.completedCount).toBe(5);
    expect(readiness.scorePct).toBe(100);

    const matrix = calculateSensitivityMatrix({
      currentPrice: 108,
      horizonYears: 3,
      bearEps: 7.5,
      baseEps: 12.5,
      bullEps: 16,
      bearPe: 12,
      basePe: 14,
      bullPe: 16,
    });
    expect(matrix.epsSteps).toHaveLength(5);
    expect(matrix.peSteps).toHaveLength(5);
    expect(matrix.rows[2]?.[2]?.targetPrice).toBe(175);
    expect(matrix.rows[2]?.[2]?.zone).toBe("margin");
  });
});
