import type { FilterVerdict } from "@kanon/core";
import type { ButtonGroupTone } from "@kanon/ui";

export type FilterKey = "recurringRevenue" | "pricingPower" | "capitalReturn" | "governance";

export const BUSINESS_FILTER_DIMENSIONS: ReadonlyArray<{
  code: string;
  key: FilterKey;
  title: string;
  prompt: string;
}> = [
  {
    code: "01",
    key: "recurringRevenue",
    title: "收入韧性与客户粘性",
    prompt: "客户是否具备高留存复购或长期合约特征？",
  },
  {
    code: "02",
    key: "pricingPower",
    title: "定价权与竞争壁垒",
    prompt: "在成本通胀或行业低谷期，能否守住 Gross Margin 并传导成本？",
  },
  {
    code: "03",
    key: "capitalReturn",
    title: "资本回报与现金流质量",
    prompt: "账面盈利是否转化为真实 FCF，ROIC 能否持续高于资本成本？",
  },
  {
    code: "04",
    key: "governance",
    title: "治理透明度与资本配置",
    prompt: "管理层是否坦诚披露 10-K 风险并保持理性回购与研发投入？",
  },
];

export const BUSINESS_FILTER_VERDICTS: ReadonlyArray<{
  id: FilterVerdict;
  label: string;
  tone: ButtonGroupTone;
}> = [
  { id: "pass", label: "通过", tone: "pass" },
  { id: "watch", label: "观察", tone: "warn" },
  { id: "veto", label: "排除", tone: "fail" },
];
