import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateResearchReadiness } from "../math/research-readiness";
import { calculateSensitivityMatrix } from "../math/sensitivity-matrix";
import { createMemoryKanonDb, getDbHealthStats, type KanonDb } from "./client";
import { KANON_MIGRATIONS } from "./migrations";
import { importThesisArchive } from "./repositories/archive-importer";
import {
  authenticateUser,
  getSessionUser,
  registerUser,
  revokeSession,
} from "./repositories/auth-store";
import { listCopilotOutputs, upsertCopilotOutput } from "./repositories/copilot-store";
import {
  addDisciplineEntry,
  deleteThesis,
  getSecSnapshot,
  listGlossaryTerms,
} from "./repositories/discipline-mutations";
import {
  createQuarterlyReview,
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
  markAgentProposalApplied,
  saveAgentRun,
} from "./repositories/review-and-agent-store";
import { listThesisRevisions } from "./repositories/revision-queries";
import { createThesis, updateThesisStep } from "./repositories/thesis-mutations";
import { getThesisById, listTheses, listThesisSummaries } from "./repositories/thesis-queries";
import * as schema from "./schema";

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

  it("dynamically discovers every Drizzle pgTable and enforces 1:1 DDL column parity + migrations", async () => {
    const entries: readonly unknown[] = Object.values(schema);
    const tables = entries.filter((entry): entry is PgTable => is(entry, PgTable));
    expect(tables.length).toBeGreaterThanOrEqual(9);

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

    const migRes = await db.execute(sql`SELECT id FROM schema_migrations ORDER BY id ASC`);
    const migRows = Array.isArray(migRes) ? migRes : migRes.rows;
    expect(migRows.map((r: Record<string, unknown>) => String(r.id))).toEqual(
      KANON_MIGRATIONS.map((m) => m.id),
    );
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

  it("persists multi-role agent runs, HITL applied IDs, and quarterly reviews with cognitive snapshots", async () => {
    const savedRun = await saveAgentRun(db, {
      thesisId: "thesis-nvda",
      engine: "grounded-local",
      briefing: {
        ticker: "NVDA",
        engine: "grounded-local",
        verdict: "建议核心跟踪 · 赔率具备安全边际",
        convictionScore: 78,
        bullSynthesis: "数据中心 CUDA 生态与算力护城河持续加固",
        bearCritique: "云巨头自研 ASIC 分流推理侧高毛利份额",
        accountingCheck: "Owner FCF 转化率优异且净现金充裕",
        traces: [],
        proposals: [],
      },
    });
    const applied = await markAgentProposalApplied(db, savedRun.id, "prop-variant");
    expect(applied).toEqual(["prop-variant"]);
    const latestRun = await getLatestAgentRun(db, "thesis-nvda");
    expect(latestRun?.appliedProposalIds).toEqual(["prop-variant"]);

    const nvda = await getThesisById(db, "thesis-nvda");
    expect(nvda).not.toBeNull();
    if (!nvda) return;
    const h0 = nvda.hypotheses[0];
    expect(h0).toBeDefined();
    if (!h0) return;

    const qResult = await createQuarterlyReview(db, "thesis-nvda", {
      quarterLabel: "FY26 Q4",
      summary: "数据中心增速超预期且毛利率维持高位",
      hypothesisVerdicts: [
        { hypothesisId: h0.id, title: h0.title, verdict: "strengthened", evidence: "毛利率 75%" },
      ],
      applyStatusUpdates: true,
    });
    expect(qResult?.review.quarterLabel).toBe("FY26 Q4");
    const reviews = await listQuarterlyReviews(db, "thesis-nvda");
    expect(reviews[0]?.quarterLabel).toBe("FY26 Q4");
    const revs = await listThesisRevisions(db, "thesis-nvda");
    expect(revs[0]?.step).toBe("quarterly_review");
    expect(revs[0]?.snapshot?.hypotheses.length).toBeGreaterThanOrEqual(3);

    const inbound = await listInboundCrossChecks(db, "thesis-nvda");
    expect(inbound.some((c) => c.sourceTicker === "MU")).toBe(true);

    const mu = await getThesisById(db, "thesis-mu");
    expect(mu).not.toBeNull();
    if (!mu) return;
    const imported = await importThesisArchive(db, {
      archive: { schemaVersion: "kanon-archive/v2", thesis: { ...mu, ticker: "MU2" } },
      mode: "create_copy",
    });
    expect(imported.thesis.ticker).toBe("MU2");
    expect(imported.thesis.hypotheses.length).toBe(mu.hypotheses.length);
    await deleteThesis(db, imported.thesis.id);
  });

  it("registers +86 accounts, isolates theses across users, and manages sessions", async () => {
    const regA = await registerUser(db, {
      phone: "138 1111 2222",
      displayName: "测试研究员A",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
      seedStarterWorkspace: true,
    });
    expect(regA.user.phoneE164).toBe("+8613811112222");
    const thesesA = await listTheses(db, regA.user.id);
    expect(thesesA.map((t) => t.ticker)).toEqual(["MU", "NVDA"]);

    const customA = await createThesis(
      db,
      { ticker: "TSM", companyName: "台积电", sectorTag: "晶圆代工", currentPrice: 195 },
      regA.user.id,
    );

    const regB = await registerUser(db, {
      phone: "+86 139 3333 4444",
      password: "Kanon2026!",
      confirmPassword: "Kanon2026!",
      seedStarterWorkspace: false,
    });
    expect(await listTheses(db, regB.user.id)).toHaveLength(0);
    expect(await getThesisById(db, customA.id, regB.user.id)).toBeNull();
    expect(await deleteThesis(db, customA.id, regB.user.id)).toBe(false);

    const authOk = await authenticateUser(db, { phone: "13811112222", password: "Kanon2026!" });
    expect(authOk?.user.id).toBe(regA.user.id);
    expect(
      await authenticateUser(db, { phone: "13811112222", password: "WrongPassword1" }),
    ).toBeNull();

    expect((await getSessionUser(db, regA.sessionToken))?.id).toBe(regA.user.id);
    await revokeSession(db, regA.sessionToken);
    expect(await getSessionUser(db, regA.sessionToken)).toBeNull();
  });
});
