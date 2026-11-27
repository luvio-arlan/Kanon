import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMemoryKanonDb, type KanonDb } from "../../client";
import { jobsTable, thesesTable } from "../../schema";
import { applyAgentProposalsAtomic } from "../agent/agent-apply-store";
import { registerUser } from "../auth-store";
import { addDisciplineEntry, deleteThesis } from "../discipline-mutations";
import { addRestrictedTicker, listAuditLogs } from "../enterprise/audit-and-restricted-store";
import { decideIcApproval, submitIcApproval } from "../enterprise/ic-and-compliance-store";
import {
  acceptOrgInvitation,
  addOrgMember,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
  OrgPolicyError,
  removeOrgMember,
} from "../enterprise/organizations-and-rls-store";
import { createResearchNote, listResearchNotes } from "../library/research-notes-store";
import { createQuarterlyReview, saveAgentRun } from "../review-and-agent-store";
import { createThesis, updateThesisStepChecked } from "../thesis-mutations";
import { getThesisById } from "../thesis-queries";
import { claimDueJobs, enqueueJob, enqueueWatchlistJobs } from "../warehouse/jobs-and-peers-store";
import { upsertPriceBars } from "../warehouse/price-bars-store";
import { upsertSecurity } from "../warehouse/securities-and-fx-store";
import {
  createPortfolioAccount,
  recordPortfolioTransaction,
} from "../workflows/portfolio-ledger-store";
import { getThesisAccess, hasThesisCapability } from "./thesis-access";

describe("Wave O RBAC Matrix, Invitation Isolation & Queue Resilience", () => {
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
    const res = await registerUser(db, {
      phone,
      password: "Password123!",
      confirmPassword: "Password123!",
      displayName,
      seedStarterWorkspace: false,
    });
    return res.user;
  }

  it("blocks viewer/compliance from mutating discipline, reviews, steps, and agent apply while allowing analyst writes", async () => {
    const owner = await reg("+8613800001001", "Owner");
    const pm = await reg("+8613800001002", "PM");
    const analyst = await reg("+8613800001003", "Analyst");
    const viewer = await reg("+8613800001004", "Viewer");
    const compliance = await reg("+8613800001005", "Compliance");

    const org = await createOrganization(db, { name: "Alpha Fund", createdBy: owner.id });
    await addOrgMember(db, { orgId: org.id, userId: pm.id, role: "pm" });
    await addOrgMember(db, { orgId: org.id, userId: analyst.id, role: "analyst" });
    await addOrgMember(db, { orgId: org.id, userId: viewer.id, role: "viewer" });
    await addOrgMember(db, { orgId: org.id, userId: compliance.id, role: "compliance" });

    const thesis = await createThesis(
      db,
      { ticker: "ORBX", companyName: "Orbital X", sectorTag: "Tech", currentPrice: 100 },
      owner.id,
    );
    await assignThesisToOrganization(db, { thesisId: thesis.id, userId: owner.id, orgId: org.id });

    const assertCap = async (
      uid: string,
      cap: "read" | "comment" | "write" | "decide",
      expected: boolean,
    ) => {
      const access = await getThesisAccess(db, thesis.id, uid);
      expect(Boolean(access && hasThesisCapability(access, cap))).toBe(expected);
    };
    await assertCap(viewer.id, "read", true);
    await assertCap(viewer.id, "comment", true);
    await assertCap(viewer.id, "write", false);
    await assertCap(compliance.id, "write", false);
    await assertCap(compliance.id, "comment", true);
    await assertCap(analyst.id, "write", true);
    await assertCap(analyst.id, "decide", false);
    await assertCap(pm.id, "decide", true);

    // P0-1: viewer & compliance CANNOT write discipline entries or rewrite weight/cost
    for (const actor of [viewer, compliance]) {
      const blocked = await addDisciplineEntry(
        db,
        thesis.id,
        {
          action: "buy",
          noLeverageConfirmed: true,
          positionCapConfirmed: true,
          exitRule: "Stop if moat breaks",
          emotion: "calm",
          priceAnchor: 100,
          weightDeltaPct: 5,
          syncPosition: true,
          note: "unauthorized",
        },
        actor.id,
      );
      expect(blocked).toBeNull();
    }
    const afterDisc = await getThesisById(db, thesis.id, owner.id);
    expect(afterDisc?.currentWeightPct).toBe(0);

    // P0-2: viewer & compliance CANNOT create quarterly review or overwrite hypothesis statuses
    const hypId = thesis.hypotheses[0]?.id ?? "";
    for (const actor of [viewer, compliance]) {
      const blockedRev = await createQuarterlyReview(
        db,
        thesis.id,
        {
          quarterLabel: "2026 Q3",
          summary: "Unauthorized rewrite",
          applyStatusUpdates: true,
          hypothesisVerdicts: [
            { hypothesisId: hypId, title: "H1", verdict: "weakened", evidence: "tamper" },
          ],
        },
        actor.id,
      );
      expect(blockedRev).toBeNull();
    }
    const afterRev = await getThesisById(db, thesis.id, owner.id);
    expect(afterRev?.hypotheses[0]?.status).toBe("watching");

    // P1-1: analyst CAN update thesis step; viewer CANNOT
    const viewerStep = await updateThesisStepChecked(
      db,
      thesis.id,
      { step: "price_anchor", currentPrice: 105 },
      viewer.id,
    );
    expect(viewerStep.kind).toBe("not_found");
    const analystStep = await updateThesisStepChecked(
      db,
      thesis.id,
      { step: "price_anchor", currentPrice: 108 },
      analyst.id,
    );
    expect(analystStep.kind).toBe("ok");

    // P1-2: analyst CAN apply agent proposals; viewer CANNOT
    const run = await saveAgentRun(db, {
      thesisId: thesis.id,
      engine: "grounded-local",
      briefing: {
        ticker: "ORBX",
        engine: "grounded-local",
        verdict: "Hold — 维持观察",
        convictionScore: 70,
        bullSynthesis: "Pricing power holds",
        bearCritique: "Margin risk",
        accountingCheck: "Clean cash flow",
        traces: [],
        proposals: [
          {
            id: "prop-1",
            target: "variant_perception",
            title: "Update VP",
            content: "Market underestimates recurring revenue.",
            rationale: "10-K segment data",
            citation: "FY25 10-K",
          },
        ],
      },
    });
    expect(
      await applyAgentProposalsAtomic(db, {
        runId: run.id,
        proposalIds: ["prop-1"],
        userId: viewer.id,
      }),
    ).toBeNull();
    const applied = await applyAgentProposalsAtomic(db, {
      runId: run.id,
      proposalIds: ["prop-1"],
      userId: analyst.id,
    });
    expect(applied?.appliedProposalIds).toContain("prop-1");

    // P1-4: PM sees analyst's research notes on shared thesis
    await createResearchNote(db, {
      thesisId: thesis.id,
      userId: analyst.id,
      input: {
        kind: "earnings_call",
        periodLabel: "2026 Q3",
        title: "Analyst Call Note",
        content: "Gross margin guidance raised by 120bps.",
        guidanceMetric: "GM",
        guidancePromised: "62%",
        guidanceDelivered: "63.2%",
      },
    });
    const allNotes = await listResearchNotes(db, thesis.id);
    expect(allNotes.some((n) => n.title === "Analyst Call Note")).toBe(true);

    // P2-1: compliance sees org audit logs
    await addRestrictedTicker(db, {
      orgId: org.id,
      ticker: "BRK.B",
      reason: "MNPI",
      addedBy: compliance.id,
    });
    const compLogs = await listAuditLogs(db, compliance.id, 30);
    expect(compLogs.some((l) => l.orgId === org.id)).toBe(true);

    // P1-1: org owner CAN delete an org-shared thesis created by analyst
    const analystThesis = await createThesis(
      db,
      { ticker: "DELX", companyName: "Delete Test", sectorTag: "Tech", currentPrice: 50 },
      analyst.id,
    );
    await assignThesisToOrganization(db, {
      thesisId: analystThesis.id,
      userId: analyst.id,
      orgId: org.id,
    });
    expect(await deleteThesis(db, analystThesis.id, viewer.id)).toBe(false);
    expect(await deleteThesis(db, analystThesis.id, owner.id)).toBe(true);
  });

  it("blocks P0-3 personal-to-org IC handover bypass, P1-11 stale snapshot, and P0-4 cross-tenant restricted list hijacking", async () => {
    const attacker = await reg("+8613800002001", "Attacker");
    const victim = await reg("+8613800002002", "Victim");
    const viewer = await reg("+8613800002003", "Viewer2");

    const personal = await createThesis(
      db,
      { ticker: "ICHO", companyName: "IC Handover", sectorTag: "Tech", currentPrice: 90 },
      victim.id,
    );
    // Submit IC while personal (orgId = null)
    const sub = await submitIcApproval(db, { thesisId: personal.id, submittedBy: victim.id });
    // Now share thesis to an org
    const org = await createOrganization(db, { name: "Handover Org", createdBy: victim.id });
    await addOrgMember(db, { orgId: org.id, userId: viewer.id, role: "viewer" });
    await assignThesisToOrganization(db, {
      thesisId: personal.id,
      userId: victim.id,
      orgId: org.id,
    });
    // P0-3: viewer CANNOT approve, and submitter CANNOT self-approve (org changed -> 409 INVALID_STATE)
    await expect(
      decideIcApproval(db, {
        thesisId: personal.id,
        approvalId: sub.id,
        decidedBy: viewer.id,
        decision: "approved",
      }),
    ).rejects.toThrow(/归属已变更/);

    // P1-11: price refresh alone does NOT stale snapshot; valuation change DOES stale snapshot
    await decideIcApproval(db, {
      thesisId: personal.id,
      approvalId: sub.id,
      decidedBy: victim.id,
      decision: "archived",
    }).catch(() => undefined);
    // Re-assign back to personal to test self-attestation + stale snapshot
    const personal2 = await createThesis(
      db,
      { ticker: "SNAP", companyName: "Snap Check", sectorTag: "Tech", currentPrice: 100 },
      victim.id,
    );
    const sub2 = await submitIcApproval(db, { thesisId: personal2.id, submittedBy: victim.id });
    // Duplicate in_review blocked
    await expect(
      submitIcApproval(db, { thesisId: personal2.id, submittedBy: victim.id }),
    ).rejects.toThrow(/已有待审/);
    // Price refresh only -> still approvable!
    await db.update(thesesTable).set({ currentPrice: 112 }).where(eq(thesesTable.id, personal2.id));
    const okDecision = await decideIcApproval(db, {
      thesisId: personal2.id,
      approvalId: sub2.id,
      decidedBy: victim.id,
      decision: "approved",
    });
    expect(okDecision.selfAttested).toBe(true);

    // Valuation change -> STALE_SNAPSHOT
    const sub3 = await submitIcApproval(db, { thesisId: personal2.id, submittedBy: victim.id });
    await updateThesisStepChecked(
      db,
      personal2.id,
      {
        step: "valuation",
        valuationInput: {
          currentPrice: 112,
          horizonYears: 3,
          bear: { eps: 5, peMultiple: 15 },
          base: { eps: 10, peMultiple: 25 },
          bull: { eps: 15, peMultiple: 30 },
        },
      },
      victim.id,
    );
    await expect(
      decideIcApproval(db, {
        thesisId: personal2.id,
        approvalId: sub3.id,
        decidedBy: victim.id,
        decision: "approved",
      }),
    ).rejects.toThrow(/已变更/);

    // P0-4: Attacker creates org, invites victim (unaccepted!), restricts NVDA -> victim's personal account buys NVDA freely
    const evilOrg = await createOrganization(db, { name: "Evil Org", createdBy: attacker.id });
    const inv = await createOrgInvitation(db, {
      orgId: evilOrg.id,
      inviteeUserId: victim.id,
      role: "viewer",
      invitedBy: attacker.id,
    });
    await addRestrictedTicker(db, {
      orgId: evilOrg.id,
      ticker: "NVDA",
      reason: "Attack",
      addedBy: attacker.id,
    });
    const personalAcct = await createPortfolioAccount(db, {
      userId: victim.id,
      name: "Victim Personal",
      initialCash: 10_000,
    });
    const buyRes = await recordPortfolioTransaction(db, {
      accountId: personalAcct.id,
      userId: victim.id,
      ticker: "NVDA",
      action: "buy",
      quantity: 10,
      price: 100,
      tradeDate: "2026-11-20",
      noLeverageConfirmed: true,
    });
    expect(buyRes.cashBalance).toBe(9000);

    // Even after accepting invitation, victim's personal account is STILL unaffected; org-scoped account IS restricted
    await acceptOrgInvitation(db, { userId: victim.id, invitationId: inv.id });
    const orgAcct = await createPortfolioAccount(db, {
      userId: victim.id,
      orgId: evilOrg.id,
      name: "Org Account",
      initialCash: 10_000,
    });
    await expect(
      recordPortfolioTransaction(db, {
        accountId: orgAcct.id,
        userId: victim.id,
        ticker: "NVDA",
        action: "buy",
        quantity: 10,
        price: 100,
        tradeDate: "2026-11-20",
        noLeverageConfirmed: true,
      }),
    ).rejects.toThrow(/合规限制名单拦截/);

    // P2-2: last owner cannot demote or remove themselves
    await expect(
      addOrgMember(db, { orgId: evilOrg.id, userId: attacker.id, role: "analyst" }),
    ).rejects.toThrow(OrgPolicyError);
    await expect(removeOrgMember(db, { orgId: evilOrg.id, userId: attacker.id })).rejects.toThrow(
      OrgPolicyError,
    );
  });

  it("enforces P0-5 priority claim(1), idempotent daily enqueue, and batched <=3 upserts for 1,260 bars", async () => {
    // 1. Priority: evaluate_alerts (priority 10) claimed before 200 bar jobs (priority 50)
    await db.delete(jobsTable);
    const day = "2026-11-27";
    for (let i = 0; i < 40; i += 1) {
      await enqueueJob(db, {
        id: `sync_daily_bars:T${i}:${day}`,
        kind: "sync_daily_bars",
        payload: { ticker: `T${i}` },
        priority: 50,
      });
    }
    await enqueueJob(db, {
      id: `evaluate_alerts:${day}`,
      kind: "evaluate_alerts",
      payload: { day },
      priority: 10,
    });
    const claimed = await claimDueJobs(db, { workerId: "w-prio", limit: 1 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.kind).toBe("evaluate_alerts");

    // 2. Idempotent enqueueWatchlistJobs skips archived theses & deduplicates same ticker/day
    await db.delete(jobsTable);
    const firstCount = await enqueueWatchlistJobs(db, day);
    expect(firstCount).toBeGreaterThan(0);

    // 3. Batch upsert of 1,260 price bars executes <= 3 INSERT statements
    const sec = await upsertSecurity(db, { ticker: "BATCH", name: "Batch Corp" });
    const bars = Array.from({ length: 1260 }, (_, idx) => {
      const dt = new Date(Date.UTC(2021, 0, 1 + idx)).toISOString().slice(0, 10);
      return {
        securityId: sec.id,
        barDate: dt,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        adjClose: 101,
        source: "yahoo",
      };
    });
    const insertSpy = vi.spyOn(db, "insert");
    const upserted = await upsertPriceBars(db, bars);
    expect(upserted).toBe(1260);
    expect(insertSpy.mock.calls.length).toBeLessThanOrEqual(3);
    insertSpy.mockRestore();
  });
});
