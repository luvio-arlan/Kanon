import {
  calculateValuationScenarios,
  type SecFilingReaderResponse,
  type ThesisDetail,
} from "@kanon/core";
import { describe, expect, it } from "vitest";
import { sanitizeProviderBaseUrl } from "../copilot/run-copilot";
import { askResearchIc } from "./ask-ic";
import { searchFilingExcerpts } from "./filing-search-tool";
import { isProposalGrounded, mergeGroundedProposals } from "./proposal-grounding";

const MOCK_FILING: SecFilingReaderResponse = {
  ticker: "NVDA",
  form: "10-Q",
  filingDate: "2026-08-28",
  accessionNumber: "0001045810-26-000102",
  documentUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000102/nvda.htm",
  source: "sec-edgar-live",
  sections: [
    {
      id: "mda",
      heading: "Item 7 / 2 · MD&A",
      category: "mda",
      signalHits: 3,
      paragraphs: [
        "Data center gross margin remained resilient at 75.1% despite Blackwell architecture ramp costs and sovereign AI cluster deployments.",
        "Total operating expenses rose modestly due to engineering headcount expansion.",
      ],
    },
  ],
  fullExcerpt: "Data center gross margin remained resilient at 75.1%.",
  diff: {
    sectionHeading: "MD&A",
    previousForm: "10-Q",
    previousFilingDate: "2026-05-28",
    addedSnippets: [
      "Export control licensing updates expanded review cycles for international SKUs.",
    ],
    removedSnippets: [],
    changeSummary: "1 added",
  },
  notice: "ok",
};

const MOCK_THESIS: ThesisDetail = {
  id: "thesis-nvda",
  indexLabel: "02",
  ticker: "NVDA",
  companyName: "英伟达",
  sectorTag: "AI 算力",
  currentPrice: 140,
  lastReviewedAt: "2026-11-24",
  horizonLabel: "3 年周期",
  horizonYears: 3,
  portfolioRole: "core",
  currentWeightPct: 10,
  targetMaxWeightPct: 15,
  avgCostBasis: 110,
  convictionSummary: "CUDA 软件生态与机柜级系统壁垒支撑算力平台长期复利。",
  status: "active",
  businessFilter: {
    recurringRevenue: "pass",
    pricingPower: "pass",
    capitalReturn: "pass",
    governance: "pass",
    notes: "",
    vetoReason: "",
    consensusView: "",
    variantPerception: "机柜级交付加速全栈粘性。",
    keyDebate: "Blackwell 放量期毛利率能否守住 73% 以上。",
    preMortem: "云厂自研加速卡超预期侵蚀推理份额。",
  },
  hypotheses: [
    {
      id: "h1",
      title: "数据中心毛利率维持 73% 以上",
      metricLabel: "综合毛利率",
      threshold: "> 73%",
      status: "validated",
      note: "Blackwell 良率爬坡后逐步回升",
    },
    {
      id: "h2",
      title: "软件服务贡献持续扩大",
      metricLabel: "Software ARR",
      threshold: "> $2B",
      status: "watching",
      note: "关注 NIM 企业订阅",
    },
    {
      id: "h3",
      title: "ROE 与 FCF 转化保持高位",
      metricLabel: "FCF 转化",
      threshold: "> 80%",
      status: "validated",
      note: "经营现金流充沛",
    },
  ],
  catalysts: [],
  crossChecks: [],
  valuationInput: {
    currentPrice: 140,
    horizonYears: 3,
    bear: { eps: 4, peMultiple: 22, probability: 0.25 },
    base: { eps: 6.5, peMultiple: 30, probability: 0.5 },
    bull: { eps: 8.5, peMultiple: 35, probability: 0.25 },
  },
  valuationModelMode: "pe",
  valuationDriverInputs: null,
  valuation: calculateValuationScenarios({
    currentPrice: 140,
    horizonYears: 3,
    bear: { eps: 4, peMultiple: 22, probability: 0.25 },
    base: { eps: 6.5, peMultiple: 30, probability: 0.5 },
    bull: { eps: 8.5, peMultiple: 35, probability: 0.25 },
  }),
  priceHistory: [
    { label: "6M", price: 115 },
    { label: "现价", price: 140 },
  ],
  disciplineEntries: [],
  updatedAt: "2026-11-24T00:00:00.000Z",
};

describe("IC Agent v2: BM25 Filing Retrieval, Grounding & Ask IC", () => {
  it("retrieves relevant SEC filing excerpts and diff snippets via BM25", () => {
    const hits = searchFilingExcerpts({
      query: "Blackwell gross margin",
      filings: [MOCK_FILING],
    });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.text).toContain("75.1%");
    expect(hits[0]?.citation).toContain("10-Q");
  });

  it("rejects ungrounded LLM proposals with hallucinated financial figures", () => {
    const corpus = "NVDA 现价 $140，毛利率 75.1%，中性目标 $195。";
    expect(
      isProposalGrounded(
        {
          id: "ok",
          target: "key_debate",
          title: "核验毛利率中枢",
          content: "围绕 75.1% 毛利率与 $195 中性目标跟踪 Blackwell 爬坡。",
          rationale: "核心估值锚",
          citation: "10-Q",
        },
        corpus,
      ),
    ).toBe(true);

    expect(
      isProposalGrounded(
        {
          id: "hallucinated",
          target: "key_debate",
          title: "编造业绩预测",
          content: "公司将在 2028 年实现 $999.5 股价和 98.4% 净利率以及 $450.2B 利润。",
          rationale: "幻觉测试",
          citation: "无",
        },
        corpus,
      ),
    ).toBe(false);

    const merged = mergeGroundedProposals({
      llmDrafts: [
        {
          id: "ok",
          target: "key_debate",
          title: "核验毛利率中枢",
          content: "围绕 75.1% 毛利率跟踪 Blackwell 放量节奏。",
          rationale: "核心多空分歧",
          citation: "10-Q",
        },
      ],
      deterministic: [],
      evidenceCorpus: corpus,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("llm-ok");
  });

  it("answers stress-test questions with citations and refuses buy/sell timing traps", async () => {
    const trap = await askResearchIc({
      thesis: MOCK_THESIS,
      secSnapshot: null,
      question: "明天能买吗？会涨吗？",
    });
    expect(trap.answer).toContain("拒绝提供短期涨跌预测");

    const grounded = await askResearchIc({
      thesis: MOCK_THESIS,
      secSnapshot: null,
      question: "Blackwell 毛利率表现如何？",
      cachedFilings: [MOCK_FILING],
    });
    expect(grounded.engine).toBe("grounded-local");
    expect(grounded.answer).toContain("75.1%");
    expect(grounded.citations.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects zero-match BM25 noise and blocks private/metadata SSRF base URLs", () => {
    const noHit = searchFilingExcerpts({
      query: "quantum submarine uranium",
      filings: [MOCK_FILING],
    });
    expect(noHit).toHaveLength(0);

    expect(sanitizeProviderBaseUrl("https://100.100.100.200/latest")).toBeUndefined();
    expect(sanitizeProviderBaseUrl("https://10.0.0.1/v1")).toBeUndefined();
    expect(sanitizeProviderBaseUrl("https://192.168.1.10/v1")).toBeUndefined();
    expect(sanitizeProviderBaseUrl("https://[::1]/v1")).toBeUndefined();
    expect(sanitizeProviderBaseUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1",
    );
  });
});
