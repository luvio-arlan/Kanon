import type { PGlite } from "@electric-sql/pglite";
import { eq, getTableName, sql } from "drizzle-orm";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createMemoryKanonDb,
  initExternalPostgres,
  type KanonDb,
  MigrationsPendingError,
} from "../../client";
import {
  agentRunsTable,
  copilotOutputsTable,
  crossChecksTable,
  disciplineEntriesTable,
  forecastsTable,
  hypothesesTable,
  icApprovalsTable,
  inboxItemsTable,
  lotsTable,
  modelVersionsTable,
  portfolioAccountsTable,
  quarterlyReviewsTable,
  researchNotesTable,
  thesesTable,
  thesisCatalystsTable,
  thesisCommentsTable,
  thesisPeersTable,
  thesisRevisionsTable,
  transactionsTable,
  userAiCredentialsTable,
  valuationScenariosTable,
} from "../../schema";
import { registerUser } from "../auth-store";
import { upsertCopilotOutput } from "../copilot-store";
import { addDisciplineEntry } from "../discipline-mutations";
import { addThesisComment, submitIcApproval } from "../enterprise/ic-and-compliance-store";
import {
  acceptOrgInvitation,
  assignThesisToOrganization,
  createOrganization,
  createOrgInvitation,
} from "../enterprise/organizations-and-rls-store";
import { createResearchNote } from "../library/research-notes-store";
import { createQuarterlyReview, saveAgentRun } from "../review-and-agent-store";
import { createThesis, updateThesisStep } from "../thesis-mutations";
import { saveModelVersion } from "../warehouse/model-versions-store";
import { upsertThesisPeer } from "../warehouse/peers-and-estimates-store";
import { updateThesisPriceByTicker } from "../warehouse/price-bars-store";
import { createImmutableForecast, createInboxItem } from "../workflows/inbox-and-forecasts-store";
import {
  createPortfolioAccount,
  recordPortfolioTransaction,
} from "../workflows/portfolio-ledger-store";
import { upsertUserAiCredential } from "./ai-credentials-and-usage-store";
import { withSystemContext, withTenantContext } from "./tenant-context";

describe("RLS Phase B & Fail-Closed Enforcement (PGlite NOBYPASSRLS)", () => {
  let db: KanonDb;
  let pglite: PGlite;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const mem = await createMemoryKanonDb({ enforceRls: true });
    db = mem.db;
    pglite = mem.pglite;
    close = mem.close;
    // Simulate Phase D atomic flip inside this isolated test DB so every fail-closed invariant is proven.
    await pglite.exec(`
      RESET ROLE;
      CREATE OR REPLACE FUNCTION kanon_rls_open() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      SET ROLE kanon_app_local;
    `);
  });

  afterAll(async () => {
    await close();
  });

  async function registerInSystem(phone: string, displayName: string) {
    const res = await withSystemContext(db, "auth_bootstrap", (tx) =>
      registerUser(tx, {
        phone,
        password: "Password123!",
        confirmPassword: "Password123!",
        displayName,
        seedStarterWorkspace: false,
      }),
    );
    return res.user;
  }

  function extractErrorMessages(err: unknown): string {
    if (!(err instanceof Error)) return String(err ?? "");
    const cause = "cause" in err ? err.cause : undefined;
    return cause ? `${err.message} ${extractErrorMessages(cause)}` : err.message;
  }

  async function expectPgError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
    let caught: unknown;
    try {
      await promise;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
    expect(extractErrorMessages(caught)).toMatch(pattern);
  }

  it("enforces fail-closed isolation across all 21 tables, RBAC roles, system context, and connection reuse", async () => {
    const userA = await registerInSystem("+8613800009001", "TenantA");
    const userB = await registerInSystem("+8613800009002", "TenantB");
    const analyst = await registerInSystem("+8613800009003", "Analyst");
    const viewer = await registerInSystem("+8613800009004", "Viewer");

    // 1. No context: SELECT returns 0 rows, INSERT violates RLS
    const unauthTheses = await db.select({ id: thesesTable.id }).from(thesesTable);
    expect(unauthTheses).toHaveLength(0);
    await expectPgError(
      db.insert(inboxItemsTable).values({
        id: "inb_no_ctx",
        userId: userA.id,
        kind: "manual",
        severity: "info",
        title: "Denied",
        body: "Denied",
      }),
      /row-level security policy/,
    );

    // Seed all 21 protected tables under userA tenant context
    const seeded = await withTenantContext(db, userA.id, async (tx) => {
      const thesis = await createThesis(
        tx,
        { ticker: "RLSX", companyName: "RLS Corp", sectorTag: "Tech", currentPrice: 100 },
        userA.id,
      );
      await updateThesisStep(
        tx,
        thesis.id,
        {
          step: "cross_checks",
          crossChecks: [
            {
              id: "cc_rls_1",
              peerCompany: "Peer",
              peerRole: "upstream",
              topic: "Supply",
              sourceAnchor: "10-K",
              statement: "Demand strong",
              alignment: "aligned",
              takeaway: "Confirmed",
            },
          ],
        },
        userA.id,
      );
      await updateThesisStep(
        tx,
        thesis.id,
        {
          step: "catalysts",
          catalysts: [
            {
              id: "cat_rls_1",
              title: "Earnings",
              dateLabel: "FY27 Q1",
              category: "earnings",
              impact: "high",
              direction: "bullish",
              status: "upcoming",
              verificationMetric: "Rev > 20%",
              note: "Watch",
            },
          ],
        },
        userA.id,
      );
      await addDisciplineEntry(
        tx,
        thesis.id,
        {
          action: "buy",
          noLeverageConfirmed: true,
          positionCapConfirmed: true,
          exitRule: "Exit if moat breaks",
          emotion: "calm",
          priceAnchor: 100,
          note: "Disciplined",
        },
        userA.id,
      );
      const note = await createResearchNote(tx, {
        thesisId: thesis.id,
        userId: userA.id,
        input: {
          kind: "earnings_call",
          periodLabel: "FY26 Q4",
          title: "Owner Note",
          content: "Detailed transcript note.",
          guidanceMetric: "GM",
          guidancePromised: "70%",
          guidanceDelivered: "71%",
        },
      });
      await upsertCopilotOutput(tx, thesis.id, {
        action: "red_team",
        engine: "grounded-local",
        payload: { ok: true },
      });
      await createQuarterlyReview(
        tx,
        thesis.id,
        {
          quarterLabel: "FY26 Q4",
          summary: "Solid quarter with margin expansion",
          hypothesisVerdicts: [
            {
              hypothesisId: thesis.hypotheses[0]?.id ?? "hyp_1",
              title: thesis.hypotheses[0]?.title ?? "Core hypothesis",
              verdict: "strengthened",
              evidence: "Q4 revenue beat",
            },
          ],
          applyStatusUpdates: false,
        },
        userA.id,
      );
      await saveAgentRun(tx, {
        thesisId: thesis.id,
        engine: "grounded-local",
        briefing: {
          ticker: "RLSX",
          engine: "grounded-local",
          verdict: "Hold with conviction",
          convictionScore: 70,
          bullSynthesis: "Strong durable pricing power and ROIC",
          bearCritique: "Watch competitive pricing pressure closely",
          accountingCheck: "Cash conversion and accruals are clean",
          traces: [],
          proposals: [],
        },
      });
      await saveModelVersion(tx, {
        thesisId: thesis.id,
        userId: userA.id,
        label: "v1",
        modelKind: "fcff_dcf",
        inputs: {},
        outputs: {},
        notes: "",
      });
      await upsertThesisPeer(tx, {
        thesisId: thesis.id,
        ticker: "PEER",
        role: "peer",
        addedBy: userA.id,
      });
      await submitIcApproval(tx, { thesisId: thesis.id, submittedBy: userA.id });
      const commentId = await addThesisComment(tx, {
        thesisId: thesis.id,
        userId: userA.id,
        anchorType: "thesis",
        body: "Owner comment",
      });
      const acct = await createPortfolioAccount(tx, {
        userId: userA.id,
        name: "A Acct",
        initialCash: 10_000,
      });
      await recordPortfolioTransaction(tx, {
        accountId: acct.id,
        userId: userA.id,
        ticker: "RLSX",
        action: "buy",
        quantity: 10,
        price: 100,
        tradeDate: "2026-11-20",
        noLeverageConfirmed: true,
      });
      await createImmutableForecast(tx, {
        userId: userA.id,
        thesisId: thesis.id,
        question: "Will revenue grow > 20%?",
        probabilities: [0.7, 0.3],
        resolveBy: "2027-06-01",
      });
      await createInboxItem(tx, {
        userId: userA.id,
        thesisId: thesis.id,
        kind: "manual",
        severity: "info",
        title: "Private inbox",
        body: "Private",
      });
      await upsertUserAiCredential(tx, {
        userId: userA.id,
        provider: "openai",
        apiKey: "sk-test-rls-secret-1234",
        label: "A Key",
      });
      return { thesis, noteId: note.id, commentId };
    });

    // 2. Tenant B sees ZERO rows across ALL 21 protected tables
    const protectedTables = [
      thesesTable,
      portfolioAccountsTable,
      forecastsTable,
      inboxItemsTable,
      userAiCredentialsTable,
      lotsTable,
      transactionsTable,
      hypothesesTable,
      valuationScenariosTable,
      disciplineEntriesTable,
      crossChecksTable,
      thesisCatalystsTable,
      thesisRevisionsTable,
      quarterlyReviewsTable,
      copilotOutputsTable,
      agentRunsTable,
      modelVersionsTable,
      thesisPeersTable,
      icApprovalsTable,
      researchNotesTable,
      thesisCommentsTable,
    ] as const;
    await withTenantContext(db, userB.id, async (tx) => {
      for (const tbl of protectedTables) {
        const rows = await tx.select().from(tbl);
        expect(rows, `Tenant B leaked rows from ${getTableName(tbl)}`).toHaveLength(0);
      }
    });

    // Share thesis to an org with analyst & viewer
    const org = await withTenantContext(db, userA.id, async (tx) => {
      const createdOrg = await createOrganization(tx, { name: "RLS Org", createdBy: userA.id });
      const invAnalyst = await createOrgInvitation(tx, {
        orgId: createdOrg.id,
        inviteeUserId: analyst.id,
        role: "analyst",
        invitedBy: userA.id,
      });
      const invViewer = await createOrgInvitation(tx, {
        orgId: createdOrg.id,
        inviteeUserId: viewer.id,
        role: "viewer",
        invitedBy: userA.id,
      });
      await assignThesisToOrganization(tx, {
        thesisId: seeded.thesis.id,
        userId: userA.id,
        orgId: createdOrg.id,
      });
      return { id: createdOrg.id, invAnalystId: invAnalyst.id, invViewerId: invViewer.id };
    });
    await withTenantContext(db, analyst.id, (tx) =>
      acceptOrgInvitation(tx, { userId: analyst.id, invitationId: org.invAnalystId }),
    );
    await withTenantContext(db, viewer.id, (tx) =>
      acceptOrgInvitation(tx, { userId: viewer.id, invitationId: org.invViewerId }),
    );

    // 3. Viewer: SELECT visible; UPDATE 0 rows; INSERT throws RLS error on child tables
    await withTenantContext(db, viewer.id, async (tx) => {
      const visibleHyps = await tx
        .select()
        .from(hypothesesTable)
        .where(eq(hypothesesTable.thesisId, seeded.thesis.id));
      expect(visibleHyps.length).toBeGreaterThan(0);

      const updHyps = await tx
        .update(hypothesesTable)
        .set({ note: "viewer-tamper" })
        .where(eq(hypothesesTable.thesisId, seeded.thesis.id))
        .returning();
      expect(updHyps).toHaveLength(0);

      const updChecks = await tx
        .update(crossChecksTable)
        .set({ takeaway: "viewer-tamper" })
        .where(eq(crossChecksTable.thesisId, seeded.thesis.id))
        .returning();
      expect(updChecks).toHaveLength(0);

      const updCopilot = await tx
        .update(copilotOutputsTable)
        .set({ engine: "grounded-local" })
        .where(eq(copilotOutputsTable.thesisId, seeded.thesis.id))
        .returning();
      expect(updCopilot).toHaveLength(0);
    });
    await expectPgError(
      withTenantContext(db, viewer.id, async (tx) => {
        await tx.insert(hypothesesTable).values({
          id: "hyp_viewer_bad",
          thesisId: seeded.thesis.id,
          sortOrder: 99,
          title: "Bad",
          metricLabel: "M",
          threshold: "T",
          status: "watching",
          note: "",
        });
      }),
      /row-level security policy/,
    );

    // 4. Analyst: child table write succeeds; DELETE on owner's thesis affects 0 rows
    await withTenantContext(db, analyst.id, async (tx) => {
      const upd = await tx
        .update(hypothesesTable)
        .set({ note: "analyst-updated" })
        .where(eq(hypothesesTable.thesisId, seeded.thesis.id))
        .returning();
      expect(upd.length).toBeGreaterThan(0);

      const del = await tx
        .delete(thesesTable)
        .where(eq(thesesTable.id, seeded.thesis.id))
        .returning();
      expect(del).toHaveLength(0);
    });

    // 5. research_notes / thesis_comments: non-author UPDATE/DELETE affects 0 rows; viewer CAN comment
    await withTenantContext(db, analyst.id, async (tx) => {
      const updNote = await tx
        .update(researchNotesTable)
        .set({ title: "hijacked" })
        .where(eq(researchNotesTable.id, seeded.noteId))
        .returning();
      expect(updNote).toHaveLength(0);
      const delNote = await tx
        .delete(researchNotesTable)
        .where(eq(researchNotesTable.id, seeded.noteId))
        .returning();
      expect(delNote).toHaveLength(0);
      const updComment = await tx
        .update(thesisCommentsTable)
        .set({ body: "hijacked" })
        .where(eq(thesisCommentsTable.id, seeded.commentId))
        .returning();
      expect(updComment).toHaveLength(0);
    });
    const viewerCommentId = await withTenantContext(db, viewer.id, (tx) =>
      addThesisComment(tx, {
        thesisId: seeded.thesis.id,
        userId: viewer.id,
        anchorType: "thesis",
        body: "Viewer question",
      }),
    );
    expect(viewerCommentId).toBeTruthy();

    // 6. System context updates prices across all tenants
    const tenantBThesis = await withTenantContext(db, userB.id, (tx) =>
      createThesis(
        tx,
        { ticker: "RLSX", companyName: "RLS Corp B", sectorTag: "Tech", currentPrice: 95 },
        userB.id,
      ),
    );
    await withSystemContext(db, "cron_tick", (tx) => updateThesisPriceByTicker(tx, "RLSX", 123.45));
    const [aAfter, bAfter] = await Promise.all([
      withTenantContext(db, userA.id, (tx) =>
        tx
          .select({ p: thesesTable.currentPrice })
          .from(thesesTable)
          .where(eq(thesesTable.id, seeded.thesis.id)),
      ),
      withTenantContext(db, userB.id, (tx) =>
        tx
          .select({ p: thesesTable.currentPrice })
          .from(thesesTable)
          .where(eq(thesesTable.id, tenantBThesis.id)),
      ),
    ]);
    expect(aAfter[0]?.p).toBe(123.45);
    expect(bAfter[0]?.p).toBe(123.45);

    // 7. Fail-closed backfill under system context sees all rows (> 0)
    const backfillCount = await withSystemContext(db, "migration_seed", async (tx) => {
      const res = await tx.execute(sql`SELECT count(*)::int AS cnt FROM hypotheses`);
      const rows = (Array.isArray(res) ? res : res.rows) as Array<Record<string, unknown>>;
      return Number(rows[0]?.cnt ?? 0);
    });
    expect(backfillCount).toBeGreaterThan(0);

    // 8. Sequential transactions on same connection never bleed kanon.current_user_id
    const uidInA = await withTenantContext(db, userA.id, async (tx) => {
      const r = await tx.execute(sql`SELECT current_setting('kanon.current_user_id', true) AS u`);
      return String(((Array.isArray(r) ? r : r.rows)[0] as Record<string, unknown>).u ?? "");
    });
    const uidInB = await withTenantContext(db, userB.id, async (tx) => {
      const r = await tx.execute(sql`SELECT current_setting('kanon.current_user_id', true) AS u`);
      return String(((Array.isArray(r) ? r : r.rows)[0] as Record<string, unknown>).u ?? "");
    });
    const uidOutsideRes = await db.execute(
      sql`SELECT current_setting('kanon.current_user_id', true) AS u`,
    );
    const uidOutside = String(
      (
        (Array.isArray(uidOutsideRes) ? uidOutsideRes : uidOutsideRes.rows)[0] as Record<
          string,
          unknown
        >
      ).u ?? "",
    );
    expect(uidInA).toBe(userA.id);
    expect(uidInB).toBe(userB.id);
    expect(uidOutside).toBe("");

    // Confirm audit_log append-only privilege revocation on kanon_app_local
    await expectPgError(
      db.execute(sql`DELETE FROM audit_log WHERE id = 'nonexistent'`),
      /permission denied/,
    );
  });

  it("Q5-9: throws MIGRATIONS_PENDING and executes zero DDL when KANON_RUNTIME_MIGRATIONS=off", async () => {
    const prev = process.env.KANON_RUNTIME_MIGRATIONS;
    process.env.KANON_RUNTIME_MIGRATIONS = "off";
    const unsafeSpy = vi.fn();
    const fakeSql = Object.assign(vi.fn().mockResolvedValue([{ mig_count: 1 }]), {
      unsafe: unsafeSpy,
    }) as unknown as postgres.Sql;
    try {
      await expect(initExternalPostgres(fakeSql, db)).rejects.toThrow(MigrationsPendingError);
      expect(unsafeSpy).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.KANON_RUNTIME_MIGRATIONS;
      else process.env.KANON_RUNTIME_MIGRATIONS = prev;
    }
  });
});
