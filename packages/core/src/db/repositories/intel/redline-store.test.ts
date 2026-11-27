import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { withSystemContext, withTenantContext } from "../security/tenant-context";
import { upsertFiling } from "../warehouse/facts-pit-store";
import { upsertSectionChunks } from "../warehouse/filing-chunks-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import { getFilingRedline, pruneStaleFilingChunks, upsertFilingRedline } from "./redline-store";

describe("R1 Redline Store & Public-Derived RLS", () => {
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

  it("allows system writes & tenant reads on filing_redlines and prunes stale filing_chunks", async () => {
    await withSystemContext(db, "cron_tick", async (tx) => {
      const sec = await upsertSecurity(tx, { ticker: "NVDA", name: "NVIDIA" });
      for (const [idx, yr] of [2025, 2024, 2023].entries()) {
        const acc = `0001045810-${String(yr).slice(-2)}-00000${idx + 1}`;
        await upsertFiling(tx, {
          accession: acc,
          securityId: sec.id,
          cik: "0001045810",
          form: "10-K",
          filedAt: `${yr}-02-25`,
          primaryDocUrl: `https://www.sec.gov/${acc}.htm`,
        });
        await upsertSectionChunks(tx, [
          {
            id: `${acc}:risk_factors:0`,
            accession: acc,
            ticker: "NVDA",
            sectionCode: "risk_factors",
            paraIndex: 0,
            text: `Risk factor text for FY${yr}.`,
            normHash: `h-${yr}`,
          },
        ]);
      }
      await upsertFilingRedline(tx, {
        currentAccession: "0001045810-25-000001",
        previousAccession: "0001045810-24-000002",
        sectionCode: "risk_factors",
        status: "ready",
        stats: { added: 1, removed: 0, modified: 0, numbersOnly: 0, critical: 1 },
        changes: [],
      });
      const pruned = await pruneStaleFilingChunks(tx);
      expect(pruned).toBe(1);
    });

    const readByTenant = await withTenantContext(db, "u-reader", (tx) =>
      getFilingRedline(tx, {
        currentAccession: "0001045810-25-000001",
        previousAccession: "0001045810-24-000002",
        sectionCode: "risk_factors",
      }),
    );
    expect(readByTenant?.status).toBe("ready");
    expect(readByTenant?.stats?.added).toBe(1);
  });
});
