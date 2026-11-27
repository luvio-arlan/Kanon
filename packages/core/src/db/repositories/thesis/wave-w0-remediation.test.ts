import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateSotpValuation } from "../../../math/models/sotp-model";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import {
  jobsTable,
  membershipsTable,
  portfolioAccountsTable,
  transactionsTable,
} from "../../schema";
import { applyAgentProposalsAtomic, getAgentRunThesisId } from "../agent/agent-apply-store";
import { registerUser } from "../auth-store";
import { listAuditLogs } from "../enterprise/audit-and-restricted-store";
import {
  acceptOrgInvitation,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
  OrgPolicyError,
  removeOrgMember,
  revokeOrgInvitation,
  updateOrgMemberRole,
} from "../enterprise/organizations-and-rls-store";
import { saveAgentRun } from "../review-and-agent-store";
import { consumePersistentRateLimit } from "../security/rate-limit-store";
import { createThesis, updateThesisStepChecked } from "../thesis-mutations";
import { getThesisById } from "../thesis-queries";
import {
  detectFactRestatements,
  upsertFiling,
  upsertFinancialFacts,
} from "../warehouse/facts-pit-store";
import {
  claimDueJobs,
  enqueueJob,
  enqueueWatchlistJobs,
  getAlertEvalCursor,
  getJobQueueHealth,
  setAlertEvalCursor,
  skipJob,
} from "../warehouse/jobs-and-peers-store";
import {
  getLatestPriceBar,
  listCorporateActions,
  listPriceBars,
  recordCorporateAction,
  replacePriceBarsForSecurity,
  upsertPriceBars,
} from "../warehouse/price-bars-store";
import { markSecuritySecStatus, upsertSecurity } from "../warehouse/securities-and-fx-store";
import { evaluateAlertRules } from "../workflows/alert-evaluator-store";
import { listInboxItems, upsertAlertRule } from "../workflows/inbox-and-forecasts-store";
import {
  createPortfolioAccount,
  listPortfolioTransactions,
} from "../workflows/portfolio-ledger-store";

describe("Wave W0 Remediation (Q5-1..Q5-12 & Migration 0026)", () => {
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

  async function reg(phone: string, displayName: string) {
    return (
      await registerUser(db, {
        phone,
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName,
        seedStarterWorkspace: false,
      })
    ).user;
  }

  it("Q5-1 & Q5-2: blocks update_role upsert bypass and revokes invites on inviter removal/demotion/manual revoke", async () => {
    const ownerA = await reg("+8613900010001", "OwnerA");
    const ownerB = await reg("+8613900010002", "OwnerB");
    const outsider = await reg("+8613900010003", "Outsider");
    const sockpuppet = await reg("+8613900010004", "Sockpuppet");

    const org = await createOrganization(db, { name: "Vault Capital", createdBy: ownerA.id });
    // Q5-1: update_role on non-member returns false and does NOT insert a membership row
    expect(
      await updateOrgMemberRole(db, {
        orgId: org.id,
        userId: outsider.id,
        role: "viewer",
        actorUserId: ownerA.id,
      }),
    ).toBe(false);
    const outsiderRows = await db
      .select()
      .from(membershipsTable)
      .where(eq(membershipsTable.userId, outsider.id));
    expect(outsiderRows).toHaveLength(0);

    // Add ownerB legitimately via invite -> accept
    const invB = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: ownerB.id,
      role: "owner",
      invitedBy: ownerA.id,
    });
    await acceptOrgInvitation(db, { userId: ownerB.id, invitationId: invB.id });

    // Q5-2a: ownerA invites sockpuppet as owner, then ownerB removes ownerA -> accept fails with 409
    const evilInv = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: sockpuppet.id,
      role: "owner",
      invitedBy: ownerA.id,
    });
    expect(
      await removeOrgMember(db, { orgId: org.id, userId: ownerA.id, actorUserId: ownerB.id }),
    ).toBe(true);
    await expect(
      acceptOrgInvitation(db, { userId: sockpuppet.id, invitationId: evilInv.id }),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION", status: 409 });

    // Q5-1: update_role on removed member returns false
    expect(
      await updateOrgMemberRole(db, {
        orgId: org.id,
        userId: ownerA.id,
        role: "viewer",
        actorUserId: ownerB.id,
      }),
    ).toBe(false);

    // Q5-2b: explicit revoke_invite blocks acceptance and appends org.revoke_invite audit log
    const manualInv = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: outsider.id,
      role: "analyst",
      invitedBy: ownerB.id,
    });
    expect(
      await revokeOrgInvitation(db, {
        orgId: org.id,
        invitationId: manualInv.id,
        actorUserId: ownerB.id,
      }),
    ).toBe(true);
    await expect(
      acceptOrgInvitation(db, { userId: outsider.id, invitationId: manualInv.id }),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION", status: 409 });
    const logs = await listAuditLogs(db, ownerB.id, 30);
    expect(logs.some((l) => l.action === "org.revoke_invite" && l.targetId === manualInv.id)).toBe(
      true,
    );

    // Q5-2c: former owner demoted to viewer has pending invitations revoked in same tx
    const invA2 = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: ownerA.id,
      role: "owner",
      invitedBy: ownerB.id,
    });
    await acceptOrgInvitation(db, { userId: ownerA.id, invitationId: invA2.id });
    const demotedInv = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: sockpuppet.id,
      role: "analyst",
      invitedBy: ownerA.id,
    });
    expect(
      await updateOrgMemberRole(db, {
        orgId: org.id,
        userId: ownerA.id,
        role: "viewer",
        actorUserId: ownerB.id,
      }),
    ).toBe(true);
    await expect(
      acceptOrgInvitation(db, { userId: sockpuppet.id, invitationId: demotedInv.id }),
    ).rejects.toMatchObject({ code: "INVALID_INVITATION", status: 409 });

    // Last owner demotion still throws 409 LAST_OWNER_PROTECTED
    await expect(
      updateOrgMemberRole(db, { orgId: org.id, userId: ownerB.id, role: "viewer" }),
    ).rejects.toThrow(OrgPolicyError);
  });

  it("Q5-3: ignores NVDA split recasts and 3M vs 9M duration pairs, while normalizing split + real restatements", async () => {
    const nvda = await upsertSecurity(db, { ticker: "NVDAS", name: "NVDA Split Fixture" });
    await upsertFiling(db, {
      accession: "acc-fy24",
      securityId: nvda.id,
      cik: "0001045810",
      form: "10-K",
      filedAt: "2024-02-21",
      primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/1045810/fy24.htm",
    });
    await upsertFiling(db, {
      accession: "acc-fy25",
      securityId: nvda.id,
      cik: "0001045810",
      form: "10-K",
      filedAt: "2025-02-26",
      primaryDocUrl: "https://www.sec.gov/Archives/edgar/data/1045810/fy25.htm",
    });
    await recordCorporateAction(db, {
      id: `split:${nvda.id}:2024-06-10`,
      securityId: nvda.id,
      exDate: "2024-06-10",
      kind: "split",
      ratio: 10,
    });
    // Pure 10:1 split recast: $11.93 -> $1.193
    await upsertFinancialFacts(db, [
      {
        id: "f-eps-1",
        securityId: nvda.id,
        accession: "acc-fy24",
        concept: "diluted_eps",
        xbrlTag: "EarningsPerShareDiluted",
        periodStart: "2023-01-30",
        periodEnd: "2024-01-28",
        duration: "annual",
        value: 11.93,
        filedAt: "2024-02-21",
      },
      {
        id: "f-eps-2",
        securityId: nvda.id,
        accession: "acc-fy25",
        concept: "diluted_eps",
        xbrlTag: "EarningsPerShareDiluted",
        periodStart: "2023-01-30",
        periodEnd: "2024-01-28",
        duration: "annual",
        value: 1.193,
        filedAt: "2025-02-26",
      },
      // Q3 3-month vs 9-month YTD sharing same periodEnd -> NOT a restatement
      {
        id: "f-rev-q3",
        securityId: nvda.id,
        accession: "acc-fy24",
        concept: "revenue",
        xbrlTag: "Revenues",
        periodStart: "2024-07-29",
        periodEnd: "2024-10-27",
        duration: "quarter",
        value: 35_000_000_000,
        filedAt: "2024-11-20",
      },
      {
        id: "f-rev-ytd",
        securityId: nvda.id,
        accession: "acc-fy24",
        concept: "revenue",
        xbrlTag: "Revenues",
        periodStart: "2024-01-29",
        periodEnd: "2024-10-27",
        duration: "ytd",
        value: 91_000_000_000,
        filedAt: "2024-11-20",
      },
      // Split + real restatement: $10.00 pre-split -> $0.80 post-split (-20% after 10:1 normalization)
      {
        id: "f-beps-1",
        securityId: nvda.id,
        accession: "acc-fy24",
        concept: "basic_eps",
        xbrlTag: "EarningsPerShareBasic",
        periodStart: "2023-01-30",
        periodEnd: "2024-01-28",
        duration: "annual",
        value: 10.0,
        filedAt: "2024-02-21",
      },
      {
        id: "f-beps-2",
        securityId: nvda.id,
        accession: "acc-fy25",
        concept: "basic_eps",
        xbrlTag: "EarningsPerShareBasic",
        periodStart: "2023-01-30",
        periodEnd: "2024-01-28",
        duration: "annual",
        value: 0.8,
        filedAt: "2025-02-26",
      },
    ]);

    expect(
      await detectFactRestatements(db, { securityId: nvda.id, concept: "diluted_eps" }),
    ).toEqual([]);
    const withRecast = await detectFactRestatements(db, {
      securityId: nvda.id,
      concept: "diluted_eps",
      includeSplitRecasts: true,
    });
    expect(withRecast).toHaveLength(1);
    expect(withRecast[0]?.kind).toBe("split_recast");

    expect(await detectFactRestatements(db, { securityId: nvda.id, concept: "revenue" })).toEqual(
      [],
    );

    const splitPlusRestate = await detectFactRestatements(db, {
      securityId: nvda.id,
      concept: "basic_eps",
    });
    expect(splitPlusRestate).toHaveLength(1);
    expect(splitPlusRestate[0]?.kind).toBe("restatement");
    expect(splitPlusRestate[0]?.deltaPct).toBeCloseTo(-20, 1);
  });

  it("Q5-4, Q5-5, Q5-8, Q5-10: handles bar replace, dividend persistence, alert cursor/priority, non-SEC skip & global rate limit", async () => {
    const sec = await upsertSecurity(db, { ticker: "REBASE", name: "Rebase Inc" });
    await upsertPriceBars(db, [
      {
        securityId: sec.id,
        barDate: "2026-01-01",
        open: 1000,
        high: 1010,
        low: 990,
        close: 1000,
        adjClose: 1000,
        source: "yahoo",
      },
      {
        securityId: sec.id,
        barDate: "2026-01-02",
        open: 1000,
        high: 1010,
        low: 990,
        close: 1005,
        adjClose: 1005,
        source: "yahoo",
      },
    ]);
    await replacePriceBarsForSecurity(db, sec.id, [
      {
        securityId: sec.id,
        barDate: "2026-01-02",
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        adjClose: 99.8,
        source: "yahoo",
      },
    ]);
    const bars = await listPriceBars(db, sec.id);
    expect(bars).toHaveLength(1);
    expect((await getLatestPriceBar(db, sec.id))?.close).toBe(100.5);

    await recordCorporateAction(db, {
      id: `div:${sec.id}:2026-01-02`,
      securityId: sec.id,
      exDate: "2026-01-02",
      kind: "dividend",
      amount: 0.5,
    });
    const actions = await listCorporateActions(db, sec.id);
    expect(actions.some((a) => a.kind === "dividend" && a.amount === 0.5)).toBe(true);

    // Q5-8 enqueueJob returns inserted boolean; Q5-5 excludeKinds keeps alerts after syncs
    await db.delete(jobsTable);
    const first = await enqueueJob(db, {
      id: "sync_daily_bars:REBASE:2026-11-29",
      kind: "sync_daily_bars",
      priority: 50,
    });
    const dup = await enqueueJob(db, {
      id: "sync_daily_bars:REBASE:2026-11-29",
      kind: "sync_daily_bars",
      priority: 50,
    });
    expect(first.inserted).toBe(true);
    expect(dup.inserted).toBe(false);
    await enqueueJob(db, {
      id: "evaluate_alerts:2026-11-29",
      kind: "evaluate_alerts",
      priority: 10,
    });
    const syncClaim = await claimDueJobs(db, {
      workerId: "w-sync",
      limit: 1,
      excludeKinds: ["evaluate_alerts"],
    });
    expect(syncClaim[0]?.kind).toBe("sync_daily_bars");

    // Q5-10: non-SEC ticker skipped cleanly and not re-enqueued; health remains non-pending
    await markSecuritySecStatus(db, "0700.HK", "not_registrant");
    const hkJob = await enqueueJob(db, {
      id: "sync_sec:0700.HK:2026-11-29",
      kind: "sync_sec",
      priority: 60,
    });
    expect(await skipJob(db, hkJob.id, "Not SEC registrant")).toBe(true);
    const health = await getJobQueueHealth(db);
    expect(health.skipped).toBeGreaterThanOrEqual(1);

    // Sunday enqueueWatchlistJobs sets forceFullRebase: true
    await db.delete(jobsTable);
    await enqueueWatchlistJobs(db, "2026-11-29"); // 2026-11-29 is Sunday
    const sundayBars = await db
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.kind, "sync_daily_bars"));
    expect(sundayBars.length).toBeGreaterThan(0);
    expect(sundayBars[0]?.payload.forceFullRebase).toBe(true);

    // Q5-5: cursor paging across multiple alert rules without duplicate deliveries
    const u = await reg("+8613900010009", "AlertCursorUser");
    const t1 = await createThesis(
      db,
      { ticker: "CUR1", companyName: "Cursor 1", sectorTag: "Tech", currentPrice: 50 },
      u.id,
    );
    const t2 = await createThesis(
      db,
      { ticker: "CUR2", companyName: "Cursor 2", sectorTag: "Tech", currentPrice: 50 },
      u.id,
    );
    await upsertAlertRule(db, {
      userId: u.id,
      thesisId: t1.id,
      kind: "price_hurdle",
      configJson: { targetPrice: 60, direction: "below" },
    });
    await upsertAlertRule(db, {
      userId: u.id,
      thesisId: t2.id,
      kind: "price_hurdle",
      configJson: { targetPrice: 60, direction: "below" },
    });
    const pass1 = await evaluateAlertRules(db, {
      now: new Date("2026-11-29T12:00:00Z"),
      budgetMs: 0,
    });
    expect(pass1.completed).toBe(false);
    expect(pass1.nextCursor).toBeTruthy();
    await setAlertEvalCursor(db, "2026-11-29", pass1.nextCursor);
    const cursor = await getAlertEvalCursor(db, "2026-11-29");
    const pass2 = await evaluateAlertRules(db, {
      now: new Date("2026-11-29T12:00:00Z"),
      afterRuleId: cursor,
    });
    expect(pass2.completed).toBe(true);
    const inbox = await listInboxItems(db, u.id);
    expect(inbox.filter((i) => i.kind === "price_hurdle")).toHaveLength(2);

    // Q5-8: global SEC token bucket caps at 8 requests per epoch second across instances
    const bucketKey = `sec:global:test-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        consumePersistentRateLimit(db, { bucketKey, maxRequests: 8, windowMs: 1000 }),
      ),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(8);
  });

  it("Q5-6, Q5-12 & 0026: honest null SOTP, atomic jsonb_set agent apply, nullable draft catalysts & opening cash ledger", async () => {
    // Q5-6: incomplete multiples or non-positive shares -> null targets
    const nullSotp = calculateSotpValuation({
      segments: [
        {
          id: "s1",
          name: "Cloud",
          metricLabel: "EBIT",
          metricValueB: 10,
          bearMultiple: null,
          baseMultiple: 20,
          bullMultiple: 25,
        },
      ],
      netCashB: 0,
      dilutedSharesM: 100,
      currentPrice: 100,
      horizonYears: 3,
    });
    expect(nullSotp.bearTargetPrice).toBeNull();
    expect(nullSotp.baseTargetPrice).toBeNull();
    expect(nullSotp.bullTargetPrice).toBeNull();

    const zeroSharesSotp = calculateSotpValuation({
      segments: [
        {
          id: "s1",
          name: "Cloud",
          metricLabel: "EBIT",
          metricValueB: 10,
          bearMultiple: 10,
          baseMultiple: 15,
          bullMultiple: 20,
        },
      ],
      netCashB: 0,
      dilutedSharesM: 0,
      currentPrice: 100,
      horizonYears: 3,
    });
    expect(zeroSharesSotp.baseTargetPrice).toBeNull();

    // Q5-12: targeted jsonb_set preserves sibling businessFilter keys & creates nullable draft catalyst
    const owner = await reg("+8613900010011", "ApplyOwner");
    const viewer = await reg("+8613900010012", "ApplyViewer");
    const org = await createOrganization(db, { name: "Apply Org", createdBy: owner.id });
    const inv = await createOrgInvitation(db, {
      orgId: org.id,
      inviteeUserId: viewer.id,
      role: "viewer",
      invitedBy: owner.id,
    });
    await acceptOrgInvitation(db, { userId: viewer.id, invitationId: inv.id });
    const thesis = await createThesis(
      db,
      { ticker: "APLY", companyName: "Apply Corp", sectorTag: "Tech", currentPrice: 100 },
      owner.id,
    );
    await assignThesisToOrganization(db, { thesisId: thesis.id, userId: owner.id, orgId: org.id });

    await updateThesisStepChecked(
      db,
      thesis.id,
      {
        step: "business_filter",
        status: "active",
        convictionSummary: thesis.convictionSummary,
        businessFilter: { ...thesis.businessFilter, consensusView: "保留的并发市场共识" },
      },
      owner.id,
    );
    const savedRun = await saveAgentRun(db, {
      thesisId: thesis.id,
      engine: "grounded-local",
      briefing: {
        ticker: "APLY",
        engine: "grounded-local",
        verdict: "基本面稳健，维持观察",
        convictionScore: 72,
        bullSynthesis: "核心云业务收入保持高双位数复合增长",
        bearCritique: "资本开支周期拉长可能短期压制自由现金流",
        accountingCheck: "应计质量与现金转换率均处于健康区间",
        traces: [],
        proposals: [
          {
            id: "prop-pm",
            target: "pre_mortem",
            title: "Pre-mortem update",
            content: "新事前推演内容：若大客户自研芯片加速将压缩毛利率",
            rationale: "SEC 10-K 客户集中度风险披露",
            citation: "10-K Item 1A",
          },
          {
            id: "prop-cat",
            target: "catalyst_draft",
            title: "Q4 Cloud Launch",
            content: "新产品周期发布节点与产能爬坡验证",
            rationale: "SEC 10-K 资本开支指引",
            citation: "10-K Item 7",
          },
        ],
      },
    });
    expect(await getAgentRunThesisId(db, savedRun.id)).toBe(thesis.id);
    // Viewer cannot apply
    expect(
      await applyAgentProposalsAtomic(db, {
        runId: savedRun.id,
        proposalIds: ["prop-pm"],
        userId: viewer.id,
      }),
    ).toBeNull();
    // Owner apply updates preMortem without clobbering consensusView & creates nullable catalyst draft
    const applied = await applyAgentProposalsAtomic(db, {
      runId: savedRun.id,
      proposalIds: ["prop-pm", "prop-cat"],
      userId: owner.id,
    });
    expect(applied?.thesis.businessFilter.consensusView).toBe("保留的并发市场共识");
    expect(applied?.thesis.businessFilter.preMortem).toBe(
      "新事前推演内容：若大客户自研芯片加速将压缩毛利率",
    );
    const cat = (await getThesisById(db, thesis.id, owner.id))?.catalysts.find(
      (c) => c.title === "Q4 Cloud Launch",
    );
    expect(cat?.impact).toBeNull();
    expect(cat?.direction).toBeNull();
    expect(cat?.dateLabel).toBe("");

    // Migration 0026 + createPortfolioAccount writes opening deposit transaction
    const acct = await createPortfolioAccount(db, {
      userId: owner.id,
      name: "Opening Cash Test",
      initialCash: 25_000,
    });
    const txs = await listPortfolioTransactions(db, acct.id);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.action).toBe("deposit");
    expect(txs[0]?.externalRef).toBe("opening_balance");
    expect(txs[0]?.quantity).toBe(25_000);
    const [acctRow] = await db
      .select()
      .from(portfolioAccountsTable)
      .where(eq(portfolioAccountsTable.id, acct.id));
    expect(acctRow?.ledgerInconsistent).toBe(false);
    const openTx = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.accountId, acct.id));
    expect(openTx[0]?.ticker).toBe("CASH");
  });
});
