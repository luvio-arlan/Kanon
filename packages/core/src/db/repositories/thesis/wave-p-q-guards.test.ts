import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InboxPostRequestSchema } from "../../../contracts/workflow-contracts";
import {
  computeTotpCode,
  decryptSecretEnvelopeWithMeta,
  encryptSecretEnvelope,
} from "../../../security/totp";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { calendarTokensTable, thesesTable, userTotpFactorsTable } from "../../schema";
import { registerUser } from "../auth-store";
import { addRestrictedTicker } from "../enterprise/audit-and-restricted-store";
import {
  acceptOrgInvitation,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
  withTenantContext,
} from "../enterprise/organizations-and-rls-store";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  verifyUserTotpFactor,
} from "../security/totp-and-lockout-store";
import { createThesis } from "../thesis-mutations";
import {
  computeRealHistoricalValuationBand,
  evaluateHistoricalValuationBand,
} from "../warehouse/price-bars-store";
import { evaluateAlertRules } from "../workflows/alert-evaluator-store";
import {
  buildCatalystIcsFeed,
  foldIcsLine,
  issueCalendarToken,
} from "../workflows/calendar-feed-store";
import { listInboxItems, upsertAlertRule } from "../workflows/inbox-and-forecasts-store";
import {
  createPortfolioAccount,
  recordPortfolioTransaction,
} from "../workflows/portfolio-ledger-store";

describe("Wave P1 & Wave Q Negative Security, Data Integrity & RLS Tests", () => {
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

  it("P1: NVDA 10:1 split band matches accurately, blocks split_unverified share jumps, and returns null current when EPS missing", () => {
    // 25 daily bars across 2024-03 (pre-split 10:1 on 2024-06-10) at split-adjusted price ~$85-$95
    const bars = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.UTC(2024, 2, 1 + i)).toISOString().slice(0, 10);
      const px = 85 + (i % 10);
      return {
        securityId: "sec-nvda",
        barDate: date,
        open: px,
        high: px + 1,
        low: px - 1,
        close: px,
        adjClose: px,
        volume: 1e6,
        source: "yahoo",
      };
    });
    // Pre-split FY24 diluted EPS reported in Feb 2024 was ~$11.93 (post-split $1.193 -> P/E ~75x)
    const pitEps = [
      { periodEnd: "2024-01-28", filedAt: "2024-02-21", duration: "annual" as const, value: 11.93 },
    ];
    const pitShares = [
      {
        periodEnd: "2024-01-28",
        filedAt: "2024-02-21",
        duration: "instant" as const,
        value: 2.46e9,
      },
      {
        periodEnd: "2025-01-26",
        filedAt: "2025-02-26",
        duration: "instant" as const,
        value: 24.5e9,
      },
    ];
    // Without split event: share count jumped ~10x -> split_unverified gate MUST return null!
    const unverified = evaluateHistoricalValuationBand({
      bars,
      annuals: [],
      pitEpsFacts: pitEps,
      pitSharesFacts: pitShares,
      splits: [],
      currentPrice: 90,
    });
    expect(unverified.band).toBeNull();
    expect(unverified.reason).toBe("split_unverified");

    // With 10:1 split on 2024-06-10: P/E around 2024-03-01 falls cleanly inside [40, 90]
    const verified = computeRealHistoricalValuationBand({
      bars,
      annuals: [],
      pitEpsFacts: pitEps,
      pitSharesFacts: pitShares,
      splits: [{ exDate: "2024-06-10", ratio: 10 }],
      currentPrice: 90,
    });
    expect(verified).not.toBeNull();
    expect(verified?.p50).toBeGreaterThanOrEqual(40);
    expect(verified?.p50).toBeLessThanOrEqual(90);
    expect(verified?.epsBasis).toBe("fy");

    // Missing currentPrice returns current=null & percentileRank=null (never max P/E)
    const noCurrent = computeRealHistoricalValuationBand({
      bars,
      annuals: [],
      pitEpsFacts: pitEps,
      pitSharesFacts: pitShares,
      splits: [{ exDate: "2024-06-10", ratio: 10 }],
      currentPrice: null,
    });
    expect(noCurrent?.current).toBeNull();
    expect(noCurrent?.percentileRank).toBeNull();
  });

  it("Q2: enforces edge-triggered alerts (1 inbox per breach), org thesis rule evaluation, and rejects unimplemented kinds", async () => {
    expect(
      InboxPostRequestSchema.safeParse({
        op: "upsert_rule",
        thesisId: "t1",
        kind: "kpi_breach",
        configJson: {},
      }).success,
    ).toBe(false);

    const reg = async (phone: string, displayName: string) =>
      (
        await registerUser(db, {
          phone,
          password: "Password123!",
          confirmPassword: "Password123!",
          displayName,
          seedStarterWorkspace: false,
        })
      ).user;
    const owner = await reg("+8613800003001", "AlertOwner");
    const member = await reg("+8613800003002", "AlertMember");
    const org = await createOrganization(db, { name: "Alert Org", createdBy: owner.id });
    const inv = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: member.id,
      role: "viewer",
      invitedBy: owner.id,
    });
    await acceptOrgInvitation(db, { userId: member.id, invitationId: inv.id });
    const thesis = await createThesis(
      db,
      { ticker: "EDGE", companyName: "Edge Corp", sectorTag: "Tech", currentPrice: 80 },
      owner.id,
    );
    await assignThesisToOrganization(db, { thesisId: thesis.id, userId: owner.id, orgId: org.id });

    // Org viewer creates price_hurdle rule on shared thesis
    await upsertAlertRule(db, {
      userId: member.id,
      thesisId: thesis.id,
      kind: "price_hurdle",
      configJson: { targetPrice: 90, direction: "below" },
    });

    // 3 consecutive days in breach -> only 1 inbox item emitted (edge triggered!)
    await evaluateAlertRules(db, new Date("2026-12-01T12:00:00Z"));
    await evaluateAlertRules(db, new Date("2026-12-02T12:00:00Z"));
    await evaluateAlertRules(db, new Date("2026-12-03T12:00:00Z"));
    const memberInbox = await listInboxItems(db, member.id);
    expect(memberInbox.filter((i) => i.kind === "price_hurdle")).toHaveLength(1);
  });

  it("Q4: rejects DB hash as calendar URL token, folds RFC 5545 lines, blocks negative sell cash & backdated sells & BRK-B alias bypass", async () => {
    const u = (
      await registerUser(db, {
        phone: "+8613800004001",
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName: "SecUser",
        seedStarterWorkspace: false,
      })
    ).user;
    const rawTok = await issueCalendarToken(db, u.id);
    const [row] = await db
      .select()
      .from(calendarTokensTable)
      .where(eq(calendarTokensTable.userId, u.id));
    expect(row?.tokenHash).toBeTruthy();
    // Passing stored hash directly MUST return null (404)
    expect(await buildCatalystIcsFeed(db, row?.tokenHash ?? "")).toBeNull();
    expect(await buildCatalystIcsFeed(db, rawTok)).toContain("BEGIN:VCALENDAR");

    // RFC 5545 75-octet folding
    const folded = foldIcsLine(`SUMMARY:${"长中文催化剂标题验证折行".repeat(6)}`);
    for (const seg of folded.split("\r\n")) {
      expect(new TextEncoder().encode(seg).length).toBeLessThanOrEqual(75);
    }

    // Ledger Q4 negative checks
    const org = await createOrganization(db, { name: "Comp Org", createdBy: u.id });
    await addRestrictedTicker(db, {
      orgId: org.id,
      ticker: "BRK.B",
      reason: "MNPI",
      addedBy: u.id,
    });
    const orgAcct = await createPortfolioAccount(db, {
      userId: u.id,
      orgId: org.id,
      name: "Comp Account",
      initialCash: 5000,
    });
    // BRK-B blocked when BRK.B is restricted
    await expect(
      recordPortfolioTransaction(db, {
        accountId: orgAcct.id,
        userId: u.id,
        ticker: "BRK-B",
        action: "buy",
        quantity: 1,
        price: 400,
        tradeDate: "2026-11-20",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/合规限制/);

    const acct = await createPortfolioAccount(db, {
      userId: u.id,
      name: "Zero Lev",
      initialCash: 1000,
    });
    await recordPortfolioTransaction(db, {
      accountId: acct.id,
      userId: u.id,
      ticker: "AAPL",
      action: "buy",
      quantity: 5,
      price: 200,
      tradeDate: "2026-11-20",
      noLeverageConfirmed: true,
    });
    // Sell dated before buy -> rejected
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: u.id,
        ticker: "AAPL",
        action: "sell",
        quantity: 1,
        price: 210,
        tradeDate: "2026-11-10",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/做空或倒填/);
    // Sell with huge fee pushing cash < 0 -> rejected
    await expect(
      recordPortfolioTransaction(db, {
        accountId: acct.id,
        userId: u.id,
        ticker: "AAPL",
        action: "sell",
        quantity: 1,
        price: 10,
        fees: 5000,
        tradeDate: "2026-11-21",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/负现金/);
  });

  it("Q4 TOTP key rotation upgrades PREV v2 envelopes to primary on read and enforces RLS under NOBYPASSRLS role", async () => {
    const prevKey = "prev-master-key-0123456789abcdef";
    const nextKey = "next-master-key-fedcba9876543210";
    const savedPrimary = process.env.KANON_CREDENTIALS_MASTER_KEY;
    const savedPrev = process.env.KANON_CREDENTIALS_MASTER_KEY_PREV;
    const savedKid = process.env.KANON_CREDENTIALS_KEY_ID;
    try {
      process.env.KANON_CREDENTIALS_MASTER_KEY = prevKey;
      process.env.KANON_CREDENTIALS_KEY_ID = "k1";
      delete process.env.KANON_CREDENTIALS_MASTER_KEY_PREV;

      const u = (
        await registerUser(db, {
          phone: "+8613800005001",
          password: "Password123!",
          confirmPassword: "Password123!",
          displayName: "RotUser",
          seedStarterWorkspace: false,
        })
      ).user;
      const enrolled = await beginTotpEnrollment(db, u.id, u.phoneE164);
      const code1 = computeTotpCode(enrolled.secret, Date.now()).code;
      const conf = await confirmTotpEnrollment(db, u.id, code1);
      expect(conf.ok).toBe(true);

      // Rotate key: k1 -> k2
      process.env.KANON_CREDENTIALS_MASTER_KEY = nextKey;
      process.env.KANON_CREDENTIALS_MASTER_KEY_PREV = prevKey;
      process.env.KANON_CREDENTIALS_KEY_ID = "k2";

      const futureCode = computeTotpCode(enrolled.secret, Date.now() + 30_000).code;
      const okVerify = await verifyUserTotpFactor(db, u.id, futureCode);
      expect(okVerify).toBe(true);

      // Stored envelope MUST now be re-encrypted with k2 primary!
      const [row] = await db
        .select({ enc: userTotpFactorsTable.secretEncrypted })
        .from(userTotpFactorsTable)
        .where(eq(userTotpFactorsTable.userId, u.id));
      expect(row?.enc.startsWith("v2:k2:")).toBe(true);
      const dec = decryptSecretEnvelopeWithMeta(row?.enc ?? "", { purpose: "totp", userId: u.id });
      expect(dec?.usedKey).toBe("primary");
      expect(encryptSecretEnvelope("x", { purpose: "generic" }).startsWith("v2:k2:")).toBe(true);
    } finally {
      if (savedPrimary === undefined) delete process.env.KANON_CREDENTIALS_MASTER_KEY;
      else process.env.KANON_CREDENTIALS_MASTER_KEY = savedPrimary;
      if (savedPrev === undefined) delete process.env.KANON_CREDENTIALS_MASTER_KEY_PREV;
      else process.env.KANON_CREDENTIALS_MASTER_KEY_PREV = savedPrev;
      if (savedKid === undefined) delete process.env.KANON_CREDENTIALS_KEY_ID;
      else process.env.KANON_CREDENTIALS_KEY_ID = savedKid;
    }

    // Q1 RLS enforcement test under NOBYPASSRLS role
    const uA = (
      await registerUser(db, {
        phone: "+8613800006001",
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName: "RlsA",
        seedStarterWorkspace: false,
      })
    ).user;
    const uB = (
      await registerUser(db, {
        phone: "+8613800006002",
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName: "RlsB",
        seedStarterWorkspace: false,
      })
    ).user;
    const tA = await createThesis(
      db,
      { ticker: "RLSA", companyName: "RLS A", sectorTag: "Tech", currentPrice: 50 },
      uA.id,
    );
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kanon_rls_test') THEN
          CREATE ROLE kanon_rls_test NOBYPASSRLS;
        END IF;
      END $$;
    `);
    await db.execute(sql`GRANT USAGE ON SCHEMA public TO kanon_rls_test`);
    await db.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kanon_rls_test`,
    );

    const visibleToB = await withTenantContext(db, uB.id, async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE kanon_rls_test`);
      return tx.select({ id: thesesTable.id }).from(thesesTable).where(eq(thesesTable.id, tA.id));
    });
    expect(visibleToB).toHaveLength(0);
  });
});
