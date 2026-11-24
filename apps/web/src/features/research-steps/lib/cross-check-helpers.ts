import type { Alignment, CrossCheck, EarningsDigest, PeerRole } from "@kanon/core";

export const ROLE_OPTIONS: ReadonlyArray<{ id: PeerRole; label: string }> = [
  { id: "upstream", label: "上游供给" },
  { id: "downstream", label: "下游客户" },
  { id: "competitor", label: "直接竞对" },
  { id: "primary", label: "本公司一阶" },
];

export const ALIGN_CYCLE: Alignment[] = ["aligned", "divergent", "pending"];

export const ALIGN_META: Record<Alignment, { label: string; variant: "pass" | "fail" | "warn" }> = {
  aligned: { label: "口径一致", variant: "pass" },
  divergent: { label: "存在分歧", variant: "fail" },
  pending: { label: "待继续核实", variant: "warn" },
};

export const ROLE_LABELS: Record<PeerRole, string> = {
  upstream: "上游供给",
  downstream: "下游客户",
  competitor: "直接竞对",
  primary: "本公司一阶",
};

export interface NewCheckDraft {
  peerCompany: string;
  peerRole: PeerRole;
  alignment: Alignment;
  topic: string;
  sourceAnchor: string;
  statement: string;
  takeaway: string;
  linkedThesisId: string | null;
}

export const EMPTY_CHECK: NewCheckDraft = {
  peerCompany: "",
  peerRole: "downstream",
  alignment: "aligned",
  topic: "",
  sourceAnchor: "",
  statement: "",
  takeaway: "",
  linkedThesisId: null,
};

export function nextAlignment(current: Alignment): Alignment {
  const idx = ALIGN_CYCLE.indexOf(current);
  return ALIGN_CYCLE[(idx + 1) % ALIGN_CYCLE.length] ?? "pending";
}

export function buildCrossCheckFromDraft(draft: NewCheckDraft): CrossCheck {
  return {
    id: `cc-${Date.now()}`,
    peerCompany: draft.peerCompany.trim(),
    peerRole: draft.peerRole,
    topic: draft.topic.trim(),
    sourceAnchor: draft.sourceAnchor.trim() || "季报电话会 / SEC 披露",
    statement: draft.statement.trim(),
    alignment: draft.alignment,
    takeaway: draft.takeaway.trim() || "与核心假设形成产业链交叉互证。",
    linkedThesisId: draft.linkedThesisId,
  };
}

export const TOP_CHECK_FIELDS = [
  { key: "peerCompany" as const, ph: "关联公司（如 台积电）" },
  { key: "topic" as const, ph: "印证议题（如 CoWoS 产能）" },
  { key: "sourceAnchor" as const, ph: "原文来源锚点" },
] as const;

export const BOTTOM_CHECK_FIELDS = [
  { key: "statement" as const, ph: "对方原话口径或数据" },
  { key: "takeaway" as const, ph: "交叉印证结论" },
] as const;

export function buildClippedCrossCheck(
  companyName: string,
  excerpt: string,
  anchor: string,
): CrossCheck {
  return {
    id: `cc-clip-${Date.now().toString(36).slice(-5)}`,
    peerCompany: companyName,
    peerRole: "primary",
    topic: "一阶原文精读摘录",
    sourceAnchor: anchor,
    statement: excerpt,
    alignment: "aligned",
    takeaway: "来自原文精读器划词摘录，待与产业链上下游口径互证。",
  };
}

const SIGNAL_REGEX =
  /(CapEx|Gross Margin|Operating Margin|Guidance|HBM|FCF|Free Cash Flow|ROIC|Inventory|Buyback|Backlog|ASP|毛利率|资本开支|指引|库存|回购|现金流|订单|产能)/gi;

export interface SignalToken {
  id: string;
  text: string;
  highlight: boolean;
}

export function tokenizeSignals(text: string): SignalToken[] {
  const parts = text.split(SIGNAL_REGEX);
  let cursor = 0;
  return parts.map((part, i) => {
    const token = { id: `tok-${cursor}-${part.length}`, text: part, highlight: i % 2 === 1 };
    cursor += part.length;
    return token;
  });
}

export type SignalCategory = "all" | "capex" | "margin" | "demand" | "capital";

export const SIGNAL_FILTER_OPTIONS: ReadonlyArray<{
  id: SignalCategory;
  label: string;
  pattern: RegExp | null;
}> = [
  { id: "all", label: "全部段落", pattern: null },
  { id: "capex", label: "资本开支/产能", pattern: /(CapEx|产能|扩产|资本开支|cleanroom|fab)/i },
  { id: "margin", label: "毛利/定价", pattern: /(Margin|ASP|毛利率|定价|pricing|gross)/i },
  {
    id: "demand",
    label: "订单/库存",
    pattern: /(Guidance|Inventory|Backlog|HBM|指引|库存|订单|需求)/i,
  },
  {
    id: "capital",
    label: "现金流/回购",
    pattern: /(FCF|Cash Flow|ROIC|Buyback|回购|现金流|分红)/i,
  },
];

export function filterParagraphsBySignal<T extends { text: string }>(
  items: readonly T[],
  category: SignalCategory,
): T[] {
  const opt = SIGNAL_FILTER_OPTIONS.find((item) => item.id === category);
  if (!opt?.pattern) return [...items];
  const re = opt.pattern;
  return items.filter((item) => re.test(item.text));
}

export function buildParagraphItems(sourceText: string, digest: EarningsDigest | null) {
  const lines = sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 0) {
    let offset = 0;
    return lines.map((text) => {
      const id = `src-${offset}-${text.length}`;
      offset += text.length + 1;
      return { id, text };
    });
  }
  if (!digest) return [];
  return [
    { id: "dig-guidance", text: digest.guidanceSummary },
    ...digest.quotesWithAnchors.map((q) => ({
      id: `dig-q-${q.sourceAnchor}-${q.topic}`,
      text: `[${q.sourceAnchor}] ${q.topic}：${q.summary}`,
    })),
    ...digest.capexSignals.map((s) => ({
      id: `dig-c-${s.slice(0, 18)}`,
      text: `CapEx 信号：${s}`,
    })),
    ...digest.toneShifts.map((t) => ({ id: `dig-t-${t.slice(0, 18)}`, text: `管理层措辞：${t}` })),
  ];
}
