import { describe, expect, it } from "vitest";
import { hybridSearchChunks, type SearchableFilingChunk } from "./hybrid-search";

const CORPUS: readonly SearchableFilingChunk[] = [
  {
    id: "gm",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 0,
    text: "Gross margin expanded 240 bps to 75.2% on higher data center software mix.",
  },
  {
    id: "capex",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 1,
    text: "Capital expenditures increased to $4.8 billion for wafer testing and server racks.",
  },
  {
    id: "fcf",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 2,
    text: "Free cash flow rose 88% year over year driven by operating cash flow conversion.",
  },
  {
    id: "sbc",
    accession: "acc-1",
    sectionCode: "item_8",
    paraIndex: 3,
    text: "Stock-based compensation expense totaled $3.9 billion representing 6.5% of revenue.",
  },
  {
    id: "export",
    accession: "acc-1",
    sectionCode: "item_1a",
    paraIndex: 4,
    text: "Export control restrictions and licensing requirements limit shipments of advanced accelerators to China.",
  },
  {
    id: "inventory",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 5,
    text: "Inventory provisions and purchase obligations reflect next-generation Blackwell transition.",
  },
  {
    id: "buyback",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 6,
    text: "Share repurchase authorizations returned $33.7 billion via stock buybacks.",
  },
  {
    id: "debt",
    accession: "acc-1",
    sectionCode: "item_8",
    paraIndex: 7,
    text: "Long-term debt maturities remain modest with senior notes bearing 3.2% fixed coupon.",
  },
  {
    id: "tax",
    accession: "acc-1",
    sectionCode: "item_8",
    paraIndex: 8,
    text: "Effective income tax rate was 13.4% due to foreign derived intangible income deductions.",
  },
  {
    id: "rd",
    accession: "acc-1",
    sectionCode: "item_7",
    paraIndex: 9,
    text: "Research and development expenses reached $12.9 billion across CUDA and silicon architecture.",
  },
  {
    id: "customer",
    accession: "acc-1",
    sectionCode: "item_1a",
    paraIndex: 10,
    text: "Customer concentration risk: three hyperscale cloud customers accounted for 46% of total revenue.",
  },
  {
    id: "foundry",
    accession: "acc-1",
    sectionCode: "item_1a",
    paraIndex: 11,
    text: "Supply chain concentration relies on single-source foundry wafer fabrication and CoWoS packaging.",
  },
];

const EVAL_CASES: ReadonlyArray<readonly [string, string]> = [
  ["毛利率为何提升", "gm"],
  ["毛利水平变化", "gm"],
  ["产品组合对毛利率影响", "gm"],
  ["毛利率表现", "gm"],
  ["资本开支计划", "capex"],
  ["资本支出规模", "capex"],
  ["服务器资本开支", "capex"],
  ["资本开支增长", "capex"],
  ["自由现金流转化", "fcf"],
  ["经营现金流与自由现金流", "fcf"],
  ["自由现金流增速", "fcf"],
  ["现金流表现", "fcf"],
  ["股权激励费用占比", "sbc"],
  ["股票薪酬 SBC", "sbc"],
  ["员工股权激励摊薄", "sbc"],
  ["股权激励成本", "sbc"],
  ["出口管制对华限制", "export"],
  ["中国芯片出口限制", "export"],
  ["美国出口管制许可证", "export"],
  ["地缘出口限制", "export"],
  ["存货拨备与采购承诺", "inventory"],
  ["库存周转和存货跌价", "inventory"],
  ["新品切换存货风险", "inventory"],
  ["存货水平", "inventory"],
  ["股票回购金额", "buyback"],
  ["回购注销股东回报", "buyback"],
  ["公司回购授权", "buyback"],
  ["股票回购规模", "buyback"],
  ["长期债务到期结构", "debt"],
  ["债务利率与负债情况", "debt"],
  ["公司债与长期借款", "debt"],
  ["债务负担", "debt"],
  ["有效税率是多少", "tax"],
  ["所得税税率变化", "tax"],
  ["海外税收减免税率", "tax"],
  ["实际税率", "tax"],
  ["研发投入金额", "rd"],
  ["研发费用与架构投入", "rd"],
  ["研发支出占比", "rd"],
  ["研发开支", "rd"],
  ["客户集中度风险", "customer"],
  ["大客户收入占比", "customer"],
  ["云厂商客户集中度", "customer"],
  ["前三大客户依赖", "customer"],
  ["晶圆代工供应链依赖", "foundry"],
  ["单一晶圆代工风险", "foundry"],
  ["先进封装供应链", "foundry"],
  ["代工与封装瓶颈", "foundry"],
  ["毛利率 gross margin", "gm"],
  ["自由现金流 free cash flow", "fcf"],
];

describe("Wave L2: 50-query bilingual retrieval eval benchmark (recall@8)", () => {
  it("achieves >= 90% recall@8 across 50 Chinese fundamental-investing queries on English 10-K corpus", () => {
    expect(EVAL_CASES).toHaveLength(50);
    let hitsAt8 = 0;
    let hitsAt3 = 0;
    for (const [query, expectedId] of EVAL_CASES) {
      const results = hybridSearchChunks({ query, chunks: CORPUS, topK: 8 });
      const ids = results.map((r) => r.chunk.id);
      if (ids.includes(expectedId)) hitsAt8 += 1;
      if (ids.slice(0, 3).includes(expectedId)) hitsAt3 += 1;
    }
    const recallAt8 = hitsAt8 / EVAL_CASES.length;
    const recallAt3 = hitsAt3 / EVAL_CASES.length;
    expect(recallAt8).toBeGreaterThanOrEqual(0.9);
    expect(recallAt3).toBeGreaterThanOrEqual(0.8);
  });
});
