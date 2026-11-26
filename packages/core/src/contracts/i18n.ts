export type KanonLocale = "zh-CN" | "en-US";

export const KANON_I18N_MESSAGES = {
  "zh-CN": {
    "brand.slogan": "在噪音里，谱出自己的确定性。",
    "nav.cockpit": "投研驾驶舱",
    "nav.inbox": "研究收件箱",
    "nav.portfolio": "零杠杆组合",
    "nav.teams": "团队与合规",
    "step.1": "商业质量评估",
    "step.2": "核心假设与催化剂",
    "step.3": "一阶资料印证",
    "step.4": "三情景估值与赔率",
    "step.5": "纪律与备忘录",
    "valuation.incomplete": "估值输入待完善",
    "valuation.unavailable": "未接入外部卖方源",
    "discipline.zeroLeverage": "严守零杠杆铁律",
    "ic.submit": "提交投委会审批",
    "ic.approved": "已批准",
    "ic.rejected": "已驳回",
  },
  "en-US": {
    "brand.slogan": "Conviction, composed.",
    "nav.cockpit": "Research Cockpit",
    "nav.inbox": "Research Inbox",
    "nav.portfolio": "Zero-Leverage Portfolio",
    "nav.teams": "Teams & Compliance",
    "step.1": "Business Quality",
    "step.2": "Falsifiable Hypotheses",
    "step.3": "Primary-Source Evidence",
    "step.4": "Valuation & Odds",
    "step.5": "Discipline & IC Memo",
    "valuation.incomplete": "Valuation inputs incomplete",
    "valuation.unavailable": "Street consensus unavailable",
    "discipline.zeroLeverage": "Strict zero-leverage discipline",
    "ic.submit": "Submit for IC Approval",
    "ic.approved": "Approved",
    "ic.rejected": "Rejected",
  },
} as const;

export type KanonMessageKey = keyof (typeof KANON_I18N_MESSAGES)["zh-CN"];

export function translateKanon(locale: KanonLocale, key: KanonMessageKey): string {
  return KANON_I18N_MESSAGES[locale][key];
}

export function formatLocaleCurrency(
  value: number,
  locale: KanonLocale = "zh-CN",
  currency = "USD",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatLocalePercent(valuePct: number, locale: KanonLocale = "zh-CN"): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(valuePct / 100);
}
