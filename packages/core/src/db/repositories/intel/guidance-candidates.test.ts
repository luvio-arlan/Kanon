import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { withSystemContext, withTenantContext } from "../security/tenant-context";
import { createThesis } from "../thesis-mutations";
import { upsertFiling } from "../warehouse/filings-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import {
  adoptGuidanceCandidate,
  listUnadoptedGuidanceCandidates,
  type UpsertGuidanceCandidateInput,
  upsertGuidanceCandidates,
} from "./guidance-candidates-store";

const USER = "u-gcand-1";

function candidate(
  securityId: string,
  accession: string,
  over: Partial<UpsertGuidanceCandidateInput> = {},
): UpsertGuidanceCandidateInput {
  return {
    securityId,
    accession,
    chunkId: `${accession}:ex99_1:3`,
    metric: "gross_margin",
    basis: "non_gaap",
    unit: "pct",
    targetFiscalYear: 2027,
    targetFiscalPeriod: "Q4",
    low: 72.5,
    high: 74,
    quote: "GAAP and non-GAAP gross margins are expected to be 73.0% and 73.5%, respectively.",
    extractor: "rule/1",
    ruleVersion: 1,
    issuedOn: "2026-11-17",
    ...over,
  };
}

async function seedSecurity(db: KanonDb, ticker: string, accession: string) {
  return withSystemContext(db, "cron_tick", async (tx) => {
    const s = await upsertSecurity(tx, { ticker, name: ticker });
    await upsertFiling(tx, {
      accession,
      securityId: s.id,
      cik: "0000000001",
      form: "8-K",
      filedAt: "2026-11-17",
      fiscalYear: 2027,
      fiscalPeriod: "Q3",
      primaryDocUrl: `https://www.sec.gov/Archives/${accession}.htm`,
    });
    return s;
  });
}

describe("V1-1 press candidates: version supersede, retraction and same-security adoption (G37)", () => {
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

  it("rejects cross-security adoption and lets rule_version 2 supersede a merged rule_version 1 row", async () => {
    const nvda = await seedSecurity(db, "NVDA", "0001045810-26-000088");
    const aapl = await seedSecurity(db, "AAPL", "0000320193-26-000001");
    const thesis = await withTenantContext(db, USER, (tx) =>
      createThesis(
        tx,
        { ticker: "AAPL", companyName: "Apple", sectorTag: "Hardware", currentPrice: 200 },
        USER,
      ),
    );
    await withSystemContext(db, "cron_tick", (tx) =>
      upsertGuidanceCandidates(tx, [candidate(nvda.id, "0001045810-26-000088")]),
    );
    const [nvdaCand] = await withSystemContext(db, "cron_tick", (tx) =>
      listUnadoptedGuidanceCandidates(tx, thesis.id, nvda.id),
    );
    expect(nvdaCand).toBeDefined();
    await expect(
      withTenantContext(db, USER, (tx) =>
        adoptGuidanceCandidate(tx, {
          thesisId: thesis.id,
          userId: USER,
          candidateId: nvdaCand?.id ?? "",
        }),
      ),
    ).rejects.toMatchObject({ code: "CANDIDATE_SECURITY_MISMATCH" });

    const written = await withSystemContext(db, "cron_tick", (tx) =>
      upsertGuidanceCandidates(tx, [
        candidate(nvda.id, "0001045810-26-000088", { low: 73, high: 74, ruleVersion: 2 }),
        candidate(nvda.id, "0001045810-26-000088", { low: 1, high: 2, ruleVersion: 1 }),
      ]),
    );
    expect(written).toBe(1);
    const [superseded] = await withSystemContext(db, "cron_tick", (tx) =>
      listUnadoptedGuidanceCandidates(tx, thesis.id, nvda.id),
    );
    expect([superseded?.low, superseded?.high, superseded?.ruleVersion]).toEqual([73, 74, 2]);

    await withSystemContext(db, "cron_tick", (tx) =>
      upsertGuidanceCandidates(tx, [
        candidate(aapl.id, "0000320193-26-000001", {
          metric: "revenue",
          unit: "usd",
          ruleVersion: 2,
        }),
      ]),
    );
    const [aaplCand] = await withSystemContext(db, "cron_tick", (tx) =>
      listUnadoptedGuidanceCandidates(tx, thesis.id, aapl.id),
    );
    const adopted = await withTenantContext(db, USER, (tx) =>
      adoptGuidanceCandidate(tx, {
        thesisId: thesis.id,
        userId: USER,
        candidateId: aaplCand?.id ?? "",
      }),
    );
    expect(adopted.id).toMatch(/^guid_/);
  });
});
