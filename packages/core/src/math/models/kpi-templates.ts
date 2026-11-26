export type IndustryKpiSectorId =
  | "saas"
  | "semiconductor"
  | "consumer_retail"
  | "bank"
  | "insurance"
  | "reit"
  | "industrial";

export interface IndustryKpiRuleTemplate {
  id: string;
  labelZh: string;
  period: "latest_q" | "ttm" | "fy";
  expression: string;
  consecutivePeriods: number;
  rationaleZh: string;
}

export interface IndustryKpiTemplatePack {
  sectorId: IndustryKpiSectorId;
  sectorLabelZh: string;
  rules: readonly IndustryKpiRuleTemplate[];
}

export const INDUSTRY_KPI_TEMPLATES: readonly IndustryKpiTemplatePack[] = [
  {
    sectorId: "saas",
    sectorLabelZh: "SaaS / 云软件",
    rules: [
      {
        id: "saas-rule40",
        labelZh: "Rule of 40 (增速 + FCF利润率 ≥ 40%)",
        period: "ttm",
        expression: "revenueGrowthPct + fcfMarginPct >= 40",
        consecutivePeriods: 2,
        rationaleZh: "衡量增长与现金流效率的平衡底线",
      },
      {
        id: "saas-nrr",
        labelZh: "净留存率 NRR ≥ 110%",
        period: "latest_q",
        expression: "nrrPct >= 110",
        consecutivePeriods: 2,
        rationaleZh: "存量客户扩购是软件复利的核心引擎",
      },
    ],
  },
  {
    sectorId: "semiconductor",
    sectorLabelZh: "半导体 / 晶圆与芯片",
    rules: [
      {
        id: "semi-gm",
        labelZh: "毛利率守住周期中枢 ≥ 50%",
        period: "latest_q",
        expression: "grossMarginPct >= 50",
        consecutivePeriods: 2,
        rationaleZh: "定价权与先进制程/架构壁垒的直接体现",
      },
      {
        id: "semi-inv",
        labelZh: "存货增速不显著高于营收增速",
        period: "latest_q",
        expression: "inventoryGrowthPct - revenueGrowthPct <= 15",
        consecutivePeriods: 2,
        rationaleZh: "防范渠道压货与周期下行拐点",
      },
    ],
  },
  {
    sectorId: "consumer_retail",
    sectorLabelZh: "消费零售 / 品牌",
    rules: [
      {
        id: "retail-sss",
        labelZh: "同店增速 SSSG ≥ 3%",
        period: "latest_q",
        expression: "sameStoreSalesGrowthPct >= 3",
        consecutivePeriods: 2,
        rationaleZh: "剔除开店稀释后的内生品牌力",
      },
      {
        id: "retail-roic",
        labelZh: "ROIC ≥ 15%",
        period: "fy",
        expression: "roicPct >= 15",
        consecutivePeriods: 2,
        rationaleZh: "单店模型与供应链周转的真实回报",
      },
    ],
  },
  {
    sectorId: "bank",
    sectorLabelZh: "银行 / 商业金融",
    rules: [
      {
        id: "bank-rotce",
        labelZh: "有形股本回报率 ROTCE ≥ 12%",
        period: "ttm",
        expression: "rotcePct >= 12",
        consecutivePeriods: 2,
        rationaleZh: "跨越利率周期的资本内生能力",
      },
      {
        id: "bank-cet1",
        labelZh: "核心一级资本充足率 CET1 ≥ 11%",
        period: "latest_q",
        expression: "cet1Pct >= 11",
        consecutivePeriods: 1,
        rationaleZh: "守住资产负债表安全边际",
      },
    ],
  },
  {
    sectorId: "insurance",
    sectorLabelZh: "保险",
    rules: [
      {
        id: "ins-cr",
        labelZh: "综合成本率 Combined Ratio < 96%",
        period: "ttm",
        expression: "combinedRatioPct < 96",
        consecutivePeriods: 2,
        rationaleZh: "确保承保利润为正、浮存金零成本",
      },
    ],
  },
  {
    sectorId: "reit",
    sectorLabelZh: "REITs / 商业地产",
    rules: [
      {
        id: "reit-affo",
        labelZh: "AFFO 派息率 ≤ 85%",
        period: "ttm",
        expression: "dividendPerShare / affoPerShare <= 0.85",
        consecutivePeriods: 2,
        rationaleZh: "留足维护性资本开支与分红安全垫",
      },
    ],
  },
  {
    sectorId: "industrial",
    sectorLabelZh: "高端制造 / 工业复利",
    rules: [
      {
        id: "ind-fcf-conv",
        labelZh: "Owner FCF 转化率 ≥ 85%",
        period: "ttm",
        expression: "ownerFcf / netIncome >= 0.85",
        consecutivePeriods: 2,
        rationaleZh: "验证订单利润真实转化为自由现金流",
      },
    ],
  },
];
