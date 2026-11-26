export type Form8kSeverity = "critical" | "warn" | "info";

export interface Form8kEventAlert {
  itemCode: string;
  titleZh: string;
  severity: Form8kSeverity;
  summaryZh: string;
}

const ITEM_METADATA: Record<
  string,
  { titleZh: string; severity: Form8kSeverity; summaryZh: string }
> = {
  "4.02": {
    titleZh: "历史财报不可信赖 / 会计重述 (Item 4.02)",
    severity: "critical",
    summaryZh: "公司声明此前发布的财务报表不可再依赖，需立即暂停既有盈利假设并核查重述幅度。",
  },
  "4.01": {
    titleZh: "审计师变更 (Item 4.01)",
    severity: "critical",
    summaryZh: "更换或解聘外部审计机构，需核查是否存在会计分歧或内控重大缺陷。",
  },
  "5.02": {
    titleZh: "核心高管或董事变动 (Item 5.02)",
    severity: "warn",
    summaryZh: "CEO/CFO 或关键董事离任、任命或薪酬变动，需评估治理与战略连续性。",
  },
  "2.02": {
    titleZh: "经营业绩与财务状况公告 (Item 2.02)",
    severity: "info",
    summaryZh: "季度或年度业绩新闻稿及财务摘要发布，建议同步核对指引兑现度。",
  },
  "1.01": {
    titleZh: "重大确定性协议签署 (Item 1.01)",
    severity: "info",
    summaryZh: "披露重大客户、并购或融资协议，需核查对现金流与稀释的影响。",
  },
  "2.06": {
    titleZh: "重大资产减值 (Item 2.06)",
    severity: "warn",
    summaryZh: "商誉或固定资产发生重大减值，提示既有资本配置回报不及预期。",
  },
};

/** Extracts canonical SEC Form 8-K Item numbers (e.g. `4.02`, `5.02`) from raw SEC metadata or text. */
export function parseForm8kItemCodes(rawItems: readonly string[] | string): string[] {
  const joined = typeof rawItems === "string" ? rawItems : rawItems.join(" ");
  const matches = joined.match(/\b[1-9]\.\d{2}\b/g) ?? [];
  return [...new Set(matches)];
}

/** Classifies SEC Form 8-K item codes into structured buy-side red-flag alerts. */
export function classifyForm8kItems(rawItems: readonly string[] | string): Form8kEventAlert[] {
  const codes = parseForm8kItemCodes(rawItems);
  const alerts: Form8kEventAlert[] = [];
  for (const code of codes) {
    const meta = ITEM_METADATA[code];
    if (!meta) continue;
    alerts.push({ itemCode: code, ...meta });
  }
  const rank: Record<Form8kSeverity, number> = { critical: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
