import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calculateResearchReadiness } from "../math/research-readiness";
import { calculateSensitivityMatrix } from "../math/sensitivity-matrix";
import { createMemoryKanonDb, getDbHealthStats, type KanonDb } from "./client";
import { KANON_MIGRATIONS } from "./migrations";
import {
  authenticateApiToken,
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "./repositories/account/api-tokens-store";
import {
  changeUserPassword,
  listUserSessions,
  revokeOtherUserSessions,
  updateUserProfile,
} from "./repositories/account/profile-and-sessions";
import {
  type AtomicAgentApplyResult,
  applyAgentProposalsAtomic,
  listAgentRuns,
} from "./repositories/agent/agent-apply-store";
import { importThesisArchive } from "./repositories/archive-importer";
import {
  authenticateUser,
  createUserSession,
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
  buildMarketQuoteCacheKey,
  getCachedMarketQuotes,
  upsertCachedMarketQuotes,
} from "./repositories/market/quote-cache-store";
import {
  createQuarterlyReview,
  getLatestAgentRun,
  listInboundCrossChecks,
  listQuarterlyReviews,
  markAgentProposalApplied,
  saveAgentRun,
} from "./repositories/review-and-agent-store";
import { listThesisRevisions } from "./repositories/revision-queries";
import {
  getCachedSecFilingDoc,
  listCachedSecFilingDocsByTicker,
  upsertCachedSecFilingDoc,
} from "./repositories/sec/filing-docs-cache-store";
import { consumePersistentRateLimit } from "./repositories/security/rate-limit-store";
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

    const withCatalysts = await updateThesisStep(db, created.id, {
      step: "catalysts",
      catalysts: [
        {
          id: "msft-cat-1",
          title: "Azure AI 季度增速验证",
          dateLabel: "FY27 Q1",
          category: "earnings",
          impact: "high",
          direction: "bullish",
          status: "upcoming",
          verificationMetric: "Azure 同比增速 > 34%",
          note: "观察 AI 工作负载贡献占比",
        },
      ],
    });
    expect(withCatalysts?.catalysts).toHaveLength(1);
    expect(withCatalysts?.catalysts[0]?.title).toContain("Azure");

    const withChecks = await updateThesisStep(db, created.id, {
      step: "cross_checks",
      crossChecks: [
        {
          id: "msft-cc-1",
          peerCompany: "Nvidia",
          peerRole: "upstream",
          topic: "GPU 配额",
          sourceAnchor: "Q3 Call",
          statement: "企业级训练采购延续双位数增长",
          alignment: "aligned",
          takeaway: "印证 Azure AI CapEx",
          hypothesisId: "missing-hyp-id",
        },
      ],
    });
    expect(withChecks?.crossChecks[0]?.hypothesisId).toBe("missing-hyp-id");

    const revisions = await listThesisRevisions(db, created.id);
    expect(revisions.length).toBeGreaterThanOrEqual(5);
    expect(revisions[0]?.step).toBe("cross_checks");

    // Consecutive auto-saves on the same step within the coalesce window update in place
    await updateThesisStep(db, created.id, {
      step: "catalysts",
      catalysts: [
        {
          id: "msft-cat-1",
          title: "Azure AI 季度增速二次确认",
          dateLabel: "FY27 Q1",
          category: "earnings",
          impact: "high",
          direction: "bullish",
          status: "upcoming",
          verificationMetric: "Azure 同比增速 > 35%",
          note: "无缝自动保存合并修订验证",
        },
      ],
    });
    await updateThesisStep(db, created.id, {
      step: "catalysts",
      catalysts: [
        {
          id: "msft-cat-1",
          title: "Azure AI 季度增速三次确认",
          dateLabel: "FY27 Q1",
          category: "earnings",
          impact: "high",
          direction: "bullish",
          status: "upcoming",
          verificationMetric: "Azure 同比增速 > 36%",
          note: "合并窗口修订验证",
        },
      ],
    });
    const coalescedRevisions = await listThesisRevisions(db, created.id);
    expect(coalescedRevisions.length).toBe(revisions.length + 1);

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

  it("manages profile updates, password rotation, session eviction, PAT auth, and Postgres quote cache", async () => {
    const reg = await registerUser(db, {
      phone: "137 2222 8888",
      displayName: "原称呼",
      password: "OldPassword1!",
      confirmPassword: "OldPassword1!",
      seedStarterWorkspace: false,
    });
    const secondSess = await createUserSession(db, reg.user.id);
    expect((await listUserSessions(db, reg.user.id, reg.sessionToken)).length).toBe(2);

    const renamed = await updateUserProfile(db, reg.user.id, "新买方研究员");
    expect(renamed?.displayName).toBe("新买方研究员");

    const pwdRes = await changeUserPassword({
      db,
      userId: reg.user.id,
      currentPassword: "OldPassword1!",
      newPassword: "NewPassword2@",
      currentRawToken: reg.sessionToken,
    });
    expect(pwdRes.ok).toBe(true);
    if (pwdRes.ok) expect(pwdRes.revokedOtherSessions).toBe(1);
    expect(await getSessionUser(db, secondSess.token)).toBeNull();
    expect(await revokeOtherUserSessions(db, reg.user.id, reg.sessionToken)).toBe(0);

    const createdPat = await createApiToken(db, reg.user.id, {
      name: "MCP Test",
      scope: "read",
      expiresInDays: 30,
    });
    expect(createdPat.plaintextToken.startsWith("kanon_pat_")).toBe(true);
    const verified = await authenticateApiToken(db, createdPat.plaintextToken);
    expect(verified?.user.id).toBe(reg.user.id);
    expect((await listApiTokens(db, reg.user.id)).length).toBe(1);
    expect(await revokeApiToken(db, reg.user.id, createdPat.token.id)).toBe(true);
    expect(await authenticateApiToken(db, createdPat.plaintextToken)).toBeNull();

    const cacheKey = buildMarketQuoteCacheKey("NVDA", "auto");
    await upsertCachedMarketQuotes(db, [
      {
        cacheKey,
        quote: {
          ticker: "NVDA",
          currency: "USD",
          sessionState: "REGULAR",
          regularPrice: 145.5,
          previousClose: 142,
          regularChange: 3.5,
          regularChangePct: 2.46,
          preMarketPrice: null,
          preMarketChange: null,
          preMarketChangePct: null,
          postMarketPrice: null,
          postMarketChange: null,
          postMarketChangePct: null,
          effectivePrice: 145.5,
          dayHigh: 147,
          dayLow: 141,
          fiftyTwoWeekHigh: 152,
          fiftyTwoWeekLow: 86,
          fiftyTwoWeekPositionPct: 90,
          volume: 42_000_000,
          source: "yahoo",
          tier: "free",
          latencyMs: 40,
          asOf: "2026-11-24T00:00:00.000Z",
        },
      },
    ]);
    const cached = await getCachedMarketQuotes(db, [cacheKey]);
    expect(cached.get("NVDA")?.regularPrice).toBe(145.5);
  });

  it("applies multi-proposal Agent batches atomically, preserves Archive v3 catalysts/reviews, and enforces persistent rate limits", async () => {
    const target = await createThesis(db, {
      ticker: "AVGO",
      companyName: "博通",
      sectorTag: "定制芯片",
      currentPrice: 175,
    });
    const withDriver = await updateThesisStep(db, target.id, {
      step: "valuation",
      valuationInput: target.valuationInput,
      modelMode: "ev_fcf",
      driverInputs: {
        currentRevenueB: 52,
        revenueCagrPct: 20,
        baseOwnerFcfB: 28,
        ownerFcfMultipleBase: 24,
        cashB: 10,
        totalDebtB: 65,
      },
    });
    expect(withDriver?.valuationModelMode).toBe("ev_fcf");
    expect(withDriver?.valuationDriverInputs?.baseOwnerFcfB).toBe(28);

    const withCat = await updateThesisStep(db, target.id, {
      step: "catalysts",
      catalysts: [
        {
          id: "cat-avgo-1",
          title: "AI XPU 出货指引上修",
          dateLabel: "FY26 Q2",
          category: "earnings",
          impact: "high",
          direction: "bullish",
          status: "upcoming",
          verificationMetric: "AI 营收同比增速",
          note: "跟踪四大云厂客户量产节奏",
        },
      ],
    });
    expect(withCat?.catalysts).toHaveLength(1);

    const savedRun = await saveAgentRun(db, {
      thesisId: target.id,
      engine: "grounded-local",
      briefing: {
        ticker: "AVGO",
        engine: "grounded-local",
        verdict: "具备长期护城河与赔率空间，建议围绕定制芯片增速跟踪",
        convictionScore: 81,
        bullSynthesis: "定制 ASIC 与网络交换芯片双轮驱动现金流持续扩张。",
        bearCritique: "大客户自研替代或资本开支节奏波动将压制估值倍数。",
        bearRebuttal: "若连续两季 AI XPU 订单放缓且毛利率跌破 72% 需审慎下调中枢。",
        accountingCheck: "Owner FCF 转化稳健，净杠杆可控。",
        traces: [],
        proposals: [
          {
            id: "p-var",
            target: "variant_perception",
            title: "补全核心预期差",
            content: "市场低估定制 ASIC 全栈软件生态与互联带宽粘性。",
            rationale: "高切换成本支撑长期毛利中枢",
            citation: "AVGO 10-K",
          },
          {
            id: "p-pre",
            target: "pre_mortem",
            title: "补全逆向推演",
            content: "若头部云厂转向通用 GPU 方案，AI 收入增长将显著低于一致预期。",
            rationale: "客户集中度风险",
            citation: "AVGO Risk Factors",
          },
        ],
      },
    });

    const runs = await listAgentRuns(db, target.id, 5);
    expect(runs[0]?.id).toBe(savedRun.id);

    const atomicRes: AtomicAgentApplyResult | null = await applyAgentProposalsAtomic(db, {
      runId: savedRun.id,
      proposalIds: ["p-var", "p-pre"],
    });
    expect(atomicRes?.appliedProposalIds).toEqual(["p-var", "p-pre"]);
    expect(atomicRes?.thesis.businessFilter.variantPerception).toContain("互联带宽粘性");
    expect(atomicRes?.thesis.businessFilter.preMortem).toContain("通用 GPU 方案");
    if (!atomicRes) throw new Error("Expected atomicRes to be present");

    const importedV3 = await importThesisArchive(db, {
      archive: {
        schemaVersion: "kanon-archive/v3",
        thesis: { ...atomicRes.thesis, ticker: "AVGORE" },
        agentRuns: runs,
      },
      mode: "create_copy",
    });
    expect(importedV3.thesis.catalysts).toHaveLength(1);
    expect(importedV3.thesis.valuationModelMode).toBe("ev_fcf");
    expect(importedV3.thesis.valuationDriverInputs?.baseOwnerFcfB).toBe(28);
    expect((await listAgentRuns(db, importedV3.thesis.id, 5)).length).toBe(1);

    const now = new Date("2026-11-25T05:00:00.000Z");
    const r1 = await consumePersistentRateLimit(db, {
      bucketKey: "test:login:1",
      maxRequests: 2,
      windowMs: 60_000,
      now,
    });
    const r2 = await consumePersistentRateLimit(db, {
      bucketKey: "test:login:1",
      maxRequests: 2,
      windowMs: 60_000,
      now,
    });
    const r3 = await consumePersistentRateLimit(db, {
      bucketKey: "test:login:1",
      maxRequests: 2,
      windowMs: 60_000,
      now,
    });
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    const resetRes = await consumePersistentRateLimit(db, {
      bucketKey: "test:login:1",
      maxRequests: 2,
      windowMs: 60_000,
      now: new Date("2026-11-25T05:02:00.000Z"),
    });
    expect(resetRes.allowed).toBe(true);
    expect(resetRes.count).toBe(1);

    await upsertCachedSecFilingDoc(db, {
      ticker: "NVDA",
      form: "10-Q",
      filingDate: "2026-08-28",
      accessionNumber: "0001045810-26-000102",
      documentUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000102/nvda.htm",
      source: "sec-edgar-live",
      sections: [
        {
          id: "mda",
          heading: "MD&A",
          category: "mda",
          paragraphs: ["Data center revenue grew rapidly with resilient gross margins."],
          signalHits: 2,
        },
      ],
      fullExcerpt: "Data center revenue grew rapidly.",
      diff: null,
      notice: "live",
    });
    const cachedDoc = await getCachedSecFilingDoc(db, "0001045810-26-000102");
    expect(cachedDoc?.cached).toBe(true);
    expect(cachedDoc?.sections[0]?.heading).toBe("MD&A");
    expect((await listCachedSecFilingDocsByTicker(db, "nvda", 3)).length).toBeGreaterThanOrEqual(1);

    await deleteThesis(db, target.id);
    await deleteThesis(db, importedV3.thesis.id);
  });
});
