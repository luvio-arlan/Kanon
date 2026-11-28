import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { withSystemContext, withTenantContext } from "../security/tenant-context";
import { upsertSectionChunks } from "../warehouse/filing-chunks-store";
import { upsertFiling } from "../warehouse/filings-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import { getFilingRedline, pruneStaleFilingChunks, upsertFilingRedline } from "./redline-store";

describe("R1 Redline Store, Public-Derived RLS & G24 Prune Protection", () => {
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

  it("retains periodic filings & redline/guidance-referenced chunks under Form 4 / 8-K flood (G24)", async () => {
    await withSystemContext(db, "cron_tick", async (tx) => {
      const sec = await upsertSecurity(tx, { ticker: "NVDA", name: "NVIDIA" });
      const addChunk = async (acc: string, form: string, filedAt: string) => {
        await upsertFiling(tx, {
          accession: acc,
          securityId: sec.id,
          cik: "0001045810",
          form,
          filedAt,
          primaryDocUrl: `https://www.sec.gov/${acc}.htm`,
        });
        await upsertSectionChunks(tx, [
          {
            id: `${acc}:risk_factors:0`,
            accession: acc,
            ticker: "NVDA",
            sectionCode: "risk_factors",
            paraIndex: 0,
            text: `Risk factor text for ${acc}.`,
            normHash: `h-${acc}`,
          },
        ]);
      };

      // 4 annuals (oldest protected by redline) + 1 10-K/A
      await addChunk("0001045810-26-000001", "10-K", "2026-02-25");
      await addChunk("0001045810-25-000002", "10-K", "2025-02-25");
      await addChunk("0001045810-24-000003", "10-K/A", "2024-04-28");
      await addChunk("0001045810-23-000004", "10-K", "2023-02-25");
      await addChunk("0001045810-22-000005", "10-K", "2022-02-25"); // 5th annual: unprotected -> pruned

      // 7 quarters: 7th oldest should be pruned, top 6 retained even under Form 4 flood
      for (let i = 1; i <= 7; i += 1) {
        const yr = 2026 - Math.floor((i - 1) / 3);
        const mo = String(11 - ((i - 1) % 3) * 3).padStart(2, "0");
        await addChunk(`0001045810-26-10000${i}`, "10-Q", `${yr}-${mo}-15`);
      }

      // 4 Form 8-K + 10 newer Form 4 filings (Form 4 must NEVER evict 10-Q chunks!)
      for (let i = 1; i <= 4; i += 1) {
        await upsertFiling(tx, {
          accession: `0001045810-26-20000${i}`,
          securityId: sec.id,
          cik: "0001045810",
          form: "8-K",
          filedAt: `2026-11-2${i}`,
          primaryDocUrl: `https://www.sec.gov/8k-${i}.htm`,
        });
      }
      for (let i = 1; i <= 10; i += 1) {
        await upsertFiling(tx, {
          accession: `0001045810-26-3000${String(i).padStart(2, "0")}`,
          securityId: sec.id,
          cik: "0001045810",
          form: "4",
          filedAt: `2026-11-${String(10 + i).padStart(2, "0")}`,
          primaryDocUrl: `https://www.sec.gov/f4-${i}.xml`,
        });
      }

      // Protect 2023 10-K via redline reference (even though it's rank 4 in annual bucket)
      await upsertFilingRedline(tx, {
        currentAccession: "0001045810-26-000001",
        previousAccession: "0001045810-23-000004",
        sectionCode: "risk_factors",
        status: "ready",
        stats: { added: 1, removed: 0, modified: 0, numbersOnly: 0, critical: 1 },
        changes: [],
      });

      const prunedFirst = await pruneStaleFilingChunks(tx);
      // 2022 10-K (unprotected rank 5) + 7th oldest 10-Q = 2 chunks pruned
      expect(prunedFirst).toBe(2);
      // Idempotency check
      expect(await pruneStaleFilingChunks(tx)).toBe(0);

      const remaining = await tx.execute(sql`SELECT accession FROM filing_chunks`);
      const accs = new Set(
        (
          (Array.isArray(remaining) ? remaining : remaining.rows) as Array<{ accession: string }>
        ).map((r) => r.accession),
      );
      expect(accs.has("0001045810-23-000004")).toBe(true); // protected by redline
      expect(accs.has("0001045810-26-100001")).toBe(true); // latest 10-Q survived Form 4 flood
      expect(accs.has("0001045810-26-100006")).toBe(true); // 6th 10-Q survived
      expect(accs.has("0001045810-26-100007")).toBe(false); // 7th 10-Q pruned
      expect(accs.has("0001045810-22-000005")).toBe(false); // 5th unprotected 10-K pruned
    });

    const readByTenant = await withTenantContext(db, "u-reader", (tx) =>
      getFilingRedline(tx, {
        currentAccession: "0001045810-26-000001",
        previousAccession: "0001045810-23-000004",
        sectionCode: "risk_factors",
      }),
    );
    expect(readByTenant?.status).toBe("ready");
    expect(readByTenant?.stats?.added).toBe(1);
  });
});
