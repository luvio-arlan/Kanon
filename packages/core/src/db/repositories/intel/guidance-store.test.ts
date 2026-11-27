import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { withSystemContext, withTenantContext } from "../security/tenant-context";
import { createThesis } from "../thesis-mutations";
import { upsertFiling, upsertFinancialFacts } from "../warehouse/facts-pit-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import { resolvePendingGuidanceCommitments } from "./guidance-resolver";
import {
  confirmGuidanceCommitment,
  createGuidanceDraft,
  GuidancePolicyError,
  listGuidanceCommitments,
} from "./guidance-store";

describe("R3 Guidance Store HITL, OCC, Superseding & PIT Resolver", () => {
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

  it("enforces HITL confirm, 409 OCC, superseding, non_gaap unresolvable, and earliest-filed PIT actuals with restatement flag", async () => {
    const userId = "u-guid-1";
    const thesis = await withTenantContext(db, userId, (tx) =>
      createThesis(
        tx,
        {
          ticker: "NVDA",
          companyName: "NVIDIA Corp",
          sectorTag: "Semiconductors",
          currentPrice: 135,
        },
        userId,
      ),
    );
    const sec = await withSystemContext(db, "cron_tick", async (tx) => {
      const s = await upsertSecurity(tx, { ticker: "NVDA", name: "NVIDIA" });
      await upsertFiling(tx, {
        accession: "0001045810-25-000010",
        securityId: s.id,
        cik: "0001045810",
        form: "10-K",
        filedAt: "2025-02-26",
        fiscalYear: 2025,
        fiscalPeriod: "FY",
        primaryDocUrl: "https://www.sec.gov/orig.htm",
      });
      await upsertFiling(tx, {
        accession: "0001045810-25-000099",
        securityId: s.id,
        cik: "0001045810",
        form: "10-K/A",
        filedAt: "2025-05-10",
        fiscalYear: 2025,
        fiscalPeriod: "FY",
        primaryDocUrl: "https://www.sec.gov/amend.htm",
      });
      await upsertFinancialFacts(tx, [
        {
          id: "f-rev-orig",
          securityId: s.id,
          accession: "0001045810-25-000010",
          concept: "revenue",
          xbrlTag: "Revenues",
          periodEnd: "2025-01-26",
          duration: "annual",
          fiscalYear: 2025,
          fiscalPeriod: "FY",
          value: 130e9,
          filedAt: "2025-02-26",
        },
        {
          id: "f-rev-amend",
          securityId: s.id,
          accession: "0001045810-25-000099",
          concept: "revenue",
          xbrlTag: "Revenues",
          periodEnd: "2025-01-26",
          duration: "annual",
          fiscalYear: 2025,
          fiscalPeriod: "FY",
          value: 125e9,
          filedAt: "2025-05-10",
        },
      ]);
      return s;
    });

    const d1 = await withTenantContext(db, userId, (tx) =>
      createGuidanceDraft(tx, {
        thesisId: thesis.id,
        securityId: sec.id,
        createdBy: userId,
        input: {
          metric: "revenue",
          basis: "gaap",
          unit: "usd",
          targetFiscalYear: 2025,
          targetFiscalPeriod: "FY",
          issuedOn: "2024-05-01",
          low: 110e9,
          high: 120e9,
          source: {
            kind: "manual",
            url: "https://sec.gov/call",
            quote: "Management guides FY25 revenue to $110B-$120B.",
          },
        },
      }),
    );
    await expect(
      withTenantContext(db, userId, (tx) =>
        confirmGuidanceCommitment(tx, {
          id: d1.id,
          thesisId: thesis.id,
          confirmedBy: userId,
          expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
        }),
      ),
    ).rejects.toThrow(GuidancePolicyError);

    const c1 = await withTenantContext(db, userId, (tx) =>
      confirmGuidanceCommitment(tx, {
        id: d1.id,
        thesisId: thesis.id,
        confirmedBy: userId,
        expectedUpdatedAt: d1.updatedAt,
      }),
    );
    expect(c1.status).toBe("confirmed");

    // Second confirmed guidance for same period supersedes first
    const d2 = await withTenantContext(db, userId, (tx) =>
      createGuidanceDraft(tx, {
        thesisId: thesis.id,
        securityId: sec.id,
        createdBy: userId,
        input: {
          metric: "revenue",
          basis: "gaap",
          unit: "usd",
          targetFiscalYear: 2025,
          targetFiscalPeriod: "FY",
          issuedOn: "2024-08-01",
          low: 120e9,
          high: 125e9,
          source: {
            kind: "manual",
            url: "https://sec.gov/call2",
            quote: "Management raised FY25 revenue outlook to $120B-$125B.",
          },
        },
      }),
    );
    const c2 = await withTenantContext(db, userId, (tx) =>
      confirmGuidanceCommitment(tx, {
        id: d2.id,
        thesisId: thesis.id,
        confirmedBy: userId,
        expectedUpdatedAt: d2.updatedAt,
      }),
    );
    expect(c2.supersedesId).toBe(c1.id);

    // Non-GAAP confirmed guidance becomes unresolvable automatically
    const dNg = await withTenantContext(db, userId, (tx) =>
      createGuidanceDraft(tx, {
        thesisId: thesis.id,
        securityId: sec.id,
        createdBy: userId,
        input: {
          metric: "gross_margin",
          basis: "non_gaap",
          unit: "pct",
          targetFiscalYear: 2025,
          targetFiscalPeriod: "FY",
          issuedOn: "2024-08-01",
          low: 73,
          high: 75,
          source: {
            kind: "manual",
            url: "https://sec.gov/call2",
            quote: "Non-GAAP gross margin expected to be 73% to 75%.",
          },
        },
      }),
    );
    await withTenantContext(db, userId, (tx) =>
      confirmGuidanceCommitment(tx, {
        id: dNg.id,
        thesisId: thesis.id,
        confirmedBy: userId,
        expectedUpdatedAt: dNg.updatedAt,
      }),
    );

    const resolved = await withSystemContext(db, "cron_tick", (tx) =>
      resolvePendingGuidanceCommitments(tx),
    );
    expect(resolved).toBe(2);

    const all = await withTenantContext(db, userId, (tx) => listGuidanceCommitments(tx, thesis.id));
    const resolvedRev = all.find((i) => i.id === c2.id);
    expect(resolvedRev?.actualValue).toBe(130e9);
    expect(resolvedRev?.actualRestated).toBe(true);
    expect(resolvedRev?.outcome).toBe("beat");
    expect(all.find((i) => i.id === dNg.id)?.outcome).toBe("unresolvable");
  });
});
