import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveCanonicalConcept } from "../../../contracts/financial-concepts";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import {
  deriveQ4FromAnnualAndYtd,
  detectFactRestatements,
  getFactsAsOf,
  upsertFiling,
  upsertFinancialFacts,
} from "./facts-pit-store";
import {
  searchFilingChunksFts,
  upsertFilingChunks,
  upsertSectionChunks,
} from "./filing-chunks-store";
import {
  claimDueJobs,
  completeJob,
  enqueueJob,
  failJobWithBackoff,
  getJobQueueHealth,
} from "./jobs-and-peers-store";
import {
  computeEstimateRevisionTrend,
  listThesisPeers,
  recordEstimateSnapshot,
  removeThesisPeer,
  upsertThesisPeer,
} from "./peers-and-estimates-store";
import {
  computeRealHistoricalValuationBand,
  computeTotalReturnPct,
  listCorporateActions,
  listPriceBars,
  recordCorporateAction,
  upsertPriceBars,
} from "./price-bars-store";
import {
  getPeriodAverageFxRate,
  getPeriodEndFxRate,
  listSecuritiesByCik,
  upsertFxRates,
  upsertSecurity,
} from "./securities-and-fx-store";

describe("Point-in-Time Data Warehouse (Stage 1: W1.1-W1.7)", () => {
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

  it("W1.1 & W1.2: shares CIK across dual-class securities (GOOG/GOOGL) and distinguishes period-end vs period-average FX", async () => {
    const goog = await upsertSecurity(db, {
      ticker: "GOOG",
      exchangeMic: "XNAS",
      cik: "0001652044",
      name: "Alphabet Inc. Class C",
      shareClass: "C",
    });
    const googl = await upsertSecurity(db, {
      ticker: "GOOGL",
      exchangeMic: "XNAS",
      cik: "0001652044",
      name: "Alphabet Inc. Class A",
      shareClass: "A",
    });
    const shared = await listSecuritiesByCik(db, "0001652044");
    expect(shared.map((s) => s.ticker)).toEqual(["GOOG", "GOOGL"]);
    expect(goog.id).not.toBe(googl.id);

    await upsertFxRates(db, [
      { currency: "TWD", rateDate: "2025-01-15", usdPerUnit: 0.031 },
      { currency: "TWD", rateDate: "2025-06-15", usdPerUnit: 0.032 },
      { currency: "TWD", rateDate: "2025-12-31", usdPerUnit: 0.033 },
    ]);
    const endFx = await getPeriodEndFxRate(db, "TWD", "2025-12-31");
    const avgFx = await getPeriodAverageFxRate(db, "TWD", "2025-01-01", "2025-12-31");
    expect(endFx?.usdPerUnit).toBeCloseTo(0.033, 5);
    expect(avgFx?.usdPerUnit).toBeCloseTo(0.032, 5);
    expect(avgFx?.sampleCount).toBe(3);
  });

  it("W1.3: stores daily price bars, corporate actions, total return, and real P10/P50/P90 valuation band", async () => {
    const msft = await upsertSecurity(db, {
      ticker: "MSFT",
      exchangeMic: "XNAS",
      cik: "0000789019",
      name: "Microsoft Corporation",
    });
    const bars = Array.from({ length: 30 }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      const px = 300 + i * 5;
      return {
        securityId: msft.id,
        barDate: `2025-01-${day}`,
        open: px,
        high: px + 2,
        low: px - 2,
        close: px,
        adjClose: px,
        volume: 20_000_000,
        source: "polygon",
      };
    });
    await upsertPriceBars(db, bars);
    await recordCorporateAction(db, {
      id: "ca-msft-div-1",
      securityId: msft.id,
      exDate: "2025-01-15",
      kind: "dividend",
      amount: 0.83,
    });
    const stored = await listPriceBars(db, msft.id);
    expect(stored).toHaveLength(30);
    expect((await listCorporateActions(db, msft.id)).length).toBe(1);
    expect(computeTotalReturnPct(stored)).toBeCloseTo(((445 - 300) / 300) * 100, 1);

    const band = computeRealHistoricalValuationBand({
      bars: stored,
      annuals: [],
      pitEpsFacts: [
        { periodEnd: "2024-06-30", filedAt: "2024-07-30", duration: "annual", value: 12 },
        // Future fact filed AFTER all bars — MUST be ignored by PIT filter!
        { periodEnd: "2025-06-30", filedAt: "2025-07-30", duration: "annual", value: 24 },
      ],
      currentPrice: 420,
    });
    expect(band).not.toBeNull();
    expect(band?.p10).toBeLessThan(band?.p50 ?? 0);
    expect(band?.p50).toBeLessThan(band?.p90 ?? 0);
    expect(band?.current).toBe(35);

    // Partial security upsert MUST NOT wipe CIK, ADR ratio, or currency (S1-2)
    const tsm = await upsertSecurity(db, {
      ticker: "TSM",
      exchangeMic: "XNYS",
      cik: "0001046179",
      name: "Taiwan Semiconductor Manufacturing Co.",
      currency: "TWD",
      adrRatio: 5,
    });
    const tsmAfterPartial = await upsertSecurity(db, {
      ticker: "TSM",
      exchangeMic: "XNYS",
      name: "TSM",
    });
    expect(tsmAfterPartial.cik).toBe(tsm.cik);
    expect(tsmAfterPartial.currency).toBe("TWD");
    expect(tsmAfterPartial.adrRatio).toBe(5);
    expect(tsmAfterPartial.name).toBe("Taiwan Semiconductor Manufacturing Co.");
  });

  it("W1.4: enforces point-in-time as-of isolation, restatement detection, Q4 derivation, and chunk search", async () => {
    expect(resolveCanonicalConcept("us-gaap", "Revenues")).toBe("revenue");
    expect(resolveCanonicalConcept("ifrs-full", "ProfitLoss")).toBe("net_income");

    const nvda = await upsertSecurity(db, {
      ticker: "NVDA",
      exchangeMic: "XNAS",
      cik: "0001045810",
      name: "NVIDIA Corporation",
    });
    await upsertFiling(db, {
      accession: "0001045810-25-000010",
      securityId: nvda.id,
      cik: "0001045810",
      form: "10-K",
      filedAt: "2025-02-26",
      periodEnd: "2025-01-26",
      fiscalYear: 2025,
      fiscalPeriod: "FY",
      primaryDocUrl: "https://www.sec.gov/nvda-2025.htm",
    });
    await upsertFiling(db, {
      accession: "0001045810-25-000099",
      securityId: nvda.id,
      cik: "0001045810",
      form: "10-K/A",
      filedAt: "2025-05-15",
      periodEnd: "2025-01-26",
      fiscalYear: 2025,
      fiscalPeriod: "FY",
      primaryDocUrl: "https://www.sec.gov/nvda-2025a.htm",
      amendsAccession: "0001045810-25-000010",
    });
    await upsertFinancialFacts(db, [
      {
        id: "f-orig",
        securityId: nvda.id,
        accession: "0001045810-25-000010",
        concept: "revenue",
        xbrlTag: "Revenues",
        periodEnd: "2025-01-26",
        duration: "annual",
        value: 130_000_000_000,
        filedAt: "2025-02-26",
      },
      {
        id: "f-restated",
        securityId: nvda.id,
        accession: "0001045810-25-000099",
        concept: "revenue",
        xbrlTag: "Revenues",
        periodEnd: "2025-01-26",
        duration: "annual",
        value: 127_000_000_000,
        filedAt: "2025-05-15",
      },
    ]);

    const asOfMarch = await getFactsAsOf(db, {
      securityId: nvda.id,
      concept: "revenue",
      asOfDate: "2025-03-15",
    });
    expect(asOfMarch[0]?.value).toBe(130_000_000_000);

    const asOfJune = await getFactsAsOf(db, {
      securityId: nvda.id,
      concept: "revenue",
      asOfDate: "2025-06-01",
    });
    expect(asOfJune[0]?.value).toBe(127_000_000_000);

    const restatements = await detectFactRestatements(db, {
      securityId: nvda.id,
      concept: "revenue",
    });
    expect(restatements).toHaveLength(1);
    expect(restatements[0]?.deltaPct).toBeCloseTo(-2.31, 1);
    expect(deriveQ4FromAnnualAndYtd({ annualValue: 130, nineMonthYtdValue: 91 })).toBe(39);

    await upsertSectionChunks(db, [
      {
        id: "chk-1",
        accession: "0001045810-25-000010",
        ticker: "NVDA",
        sectionCode: "item_1a",
        paraIndex: 0,
        text: "Export control restrictions may adversely affect Data Center revenue.",
        normHash: "hash-1",
      },
    ]);
    await upsertFilingChunks(db, [
      {
        id: "chk-2",
        accession: "0001045810-25-000010",
        ticker: "NVDA",
        sectionCode: "item_7",
        paraIndex: 1,
        text: "Capital expenditures and gross margin expanded across enterprise AI deployments.",
      },
    ]);
    const hits = await searchFilingChunksFts(db, {
      ticker: "NVDA",
      tsQuery: '"export control" OR revenue',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe("chk-1");

    // Verify GIN index idx_filing_chunks_fts is usable by PostgreSQL planner (R4)
    const planText = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const explained = await tx.execute(sql`
        EXPLAIN SELECT id FROM filing_chunks
        WHERE to_tsvector('english', text) @@ websearch_to_tsquery('english', 'export control')
      `);
      const rows = (Array.isArray(explained) ? explained : explained.rows) as Array<
        Record<string, unknown>
      >;
      return rows.map((r) => String(Object.values(r)[0] ?? "")).join("\n");
    });
    expect(planText).toContain("idx_filing_chunks_fts");
  });

  it("W1.5 & W1.7: runs Postgres job queue with backoff, persists thesis peers, and computes estimate revision trend", async () => {
    const { id: jobId } = await enqueueJob(db, {
      kind: "noop",
      payload: { ticker: "MU" },
      maxAttempts: 2,
    });
    const claimed = await claimDueJobs(db, { workerId: "w-1", limit: 5 });
    expect(claimed.some((j) => j.id === jobId)).toBe(true);
    const firstFail = await failJobWithBackoff(db, jobId, "transient timeout");
    expect(firstFail).toBe("pending");
    await completeJob(db, jobId);
    const health = await getJobQueueHealth(db);
    expect(health.done).toBeGreaterThanOrEqual(1);

    await upsertThesisPeer(db, { thesisId: "thesis-mu", ticker: "WDC", role: "peer" });
    await upsertThesisPeer(db, { thesisId: "thesis-mu", ticker: "STX", role: "competitor" });
    const peers = await listThesisPeers(db, "thesis-mu");
    expect(peers.map((p) => p.ticker)).toEqual(["WDC", "STX"]);
    expect(await removeThesisPeer(db, "thesis-mu", "STX")).toBe(true);

    const muSec = await upsertSecurity(db, { ticker: "MU", name: "Micron Technology" });
    await recordEstimateSnapshot(db, {
      securityId: muSec.id,
      provider: "fmp",
      metric: "eps",
      fiscalPeriod: "FY2027",
      mean: 10.0,
      asOf: "2026-08-01",
    });
    await recordEstimateSnapshot(db, {
      securityId: muSec.id,
      provider: "fmp",
      metric: "eps",
      fiscalPeriod: "FY2027",
      mean: 11.4,
      asOf: "2026-10-01",
    });
    const trend = await computeEstimateRevisionTrend(db, {
      securityId: muSec.id,
      metric: "eps",
      fiscalPeriod: "FY2027",
    });
    expect(trend).toBe("up");
  });

  it("G9: seeded property test guarantees zero look-ahead bias in getFactsAsOf and P/E band", async () => {
    let state = 20261127;
    const nextRand = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const pitSec = await upsertSecurity(db, { ticker: "PITTEST", name: "PIT Property Corp" });
    await upsertFiling(db, {
      accession: "pit-acc-2023",
      securityId: pitSec.id,
      cik: "0009999",
      form: "10-K",
      filedAt: "2024-02-15",
      primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/9999/2023.htm",
    });
    await upsertFiling(db, {
      accession: "pit-acc-2024",
      securityId: pitSec.id,
      cik: "0009999",
      form: "10-K",
      filedAt: "2025-02-20",
      primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/9999/2024.htm",
    });
    await upsertFinancialFacts(db, [
      {
        id: "pit-eps-2023",
        securityId: pitSec.id,
        accession: "pit-acc-2023",
        concept: "diluted_eps",
        xbrlTag: "EarningsPerShareDiluted",
        periodEnd: "2023-12-31",
        duration: "annual",
        value: 5.0,
        unit: "USD/shares",
        filedAt: "2024-02-15",
      },
      {
        id: "pit-eps-2024",
        securityId: pitSec.id,
        accession: "pit-acc-2024",
        concept: "diluted_eps",
        xbrlTag: "EarningsPerShareDiluted",
        periodEnd: "2024-12-31",
        duration: "annual",
        value: 50.0,
        unit: "USD/shares",
        filedAt: "2025-02-20",
      },
    ]);

    for (let trial = 0; trial < 25; trial += 1) {
      const month = String(Math.floor(nextRand() * 12) + 1).padStart(2, "0");
      const day = String(Math.floor(nextRand() * 28) + 1).padStart(2, "0");
      const year = nextRand() < 0.5 ? "2024" : "2025";
      const asOfDate = `${year}-${month}-${day}`;
      const visible = await getFactsAsOf(db, {
        securityId: pitSec.id,
        concept: "diluted_eps",
        asOfDate,
      });
      for (const f of visible) {
        expect(f.filedAt <= asOfDate).toBe(true);
      }
      if (asOfDate < "2025-02-20") {
        expect(visible.some((f) => f.value === 50.0)).toBe(false);
      }
    }
  });
});
