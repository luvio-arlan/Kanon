import type { Alignment, CrossCheck, PeerRole } from "@kanon/core";

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
