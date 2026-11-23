"use client";

import type { Alignment, CrossCheck, GlossaryTerm, PeerRole } from "@kanon/core";
import { Badge, Button, Card, Input } from "@kanon/ui";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { GlossaryText } from "@/features/glossary";

const ROLE_LABELS: Record<PeerRole, string> = {
  upstream: "上游供给",
  downstream: "下游客户",
  competitor: "直接竞对",
  primary: "本公司一阶",
};

const ALIGN_META: Record<Alignment, { label: string; variant: "pass" | "fail" | "warn" }> = {
  aligned: { label: "口径一致", variant: "pass" },
  divergent: { label: "存在分歧", variant: "fail" },
  pending: { label: "待继续核实", variant: "warn" },
};

interface NewCheckDraft {
  peerCompany: string;
  topic: string;
  sourceAnchor: string;
  statement: string;
  takeaway: string;
}

const EMPTY_CHECK: NewCheckDraft = {
  peerCompany: "",
  topic: "",
  sourceAnchor: "",
  statement: "",
  takeaway: "",
};

export function CrossCheckItemCard({
  cc,
  glossary,
  onDelete,
}: {
  cc: CrossCheck;
  glossary: readonly GlossaryTerm[];
  onDelete: () => void;
}) {
  const align = ALIGN_META[cc.alignment];
  return (
    <Card className="space-y-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink-primary">{cc.peerCompany}</span>
          <Badge variant="titanium">{ROLE_LABELS[cc.peerRole]}</Badge>
          <Badge variant={align.variant}>{align.label}</Badge>
        </div>
        <button
          type="button"
          aria-label="删除对照项"
          onClick={onDelete}
          className="cursor-pointer rounded-control p-1 text-ink-muted hover:bg-muted hover:text-status-fail"
        >
          <IconTrash size={15} stroke={1.5} />
        </button>
      </div>
      <div className="text-xs text-ink-muted">
        议题：{cc.topic} · 来源：{cc.sourceAnchor}
      </div>
      <p className="text-sm leading-relaxed text-ink-primary">
        <GlossaryText text={cc.statement} terms={glossary} />
      </p>
      <p className="text-xs text-ink-secondary">结论：{cc.takeaway}</p>
    </Card>
  );
}

function buildCrossCheckFromDraft(draft: NewCheckDraft): CrossCheck {
  return {
    id: `cc-${Date.now()}`,
    peerCompany: draft.peerCompany.trim(),
    peerRole: "downstream",
    topic: draft.topic.trim(),
    sourceAnchor: draft.sourceAnchor.trim() || "季报电话会 / SEC 披露",
    statement: draft.statement.trim(),
    alignment: "aligned",
    takeaway: draft.takeaway.trim() || "与核心假设形成产业链交叉互证。",
  };
}

function CrossCheckInputs({
  draft,
  onPatch,
}: {
  draft: NewCheckDraft;
  onPatch: (p: Partial<NewCheckDraft>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          value={draft.peerCompany}
          onChange={(e) => onPatch({ peerCompany: e.target.value })}
          placeholder="关联公司（如 台积电）"
        />
        <Input
          value={draft.topic}
          onChange={(e) => onPatch({ topic: e.target.value })}
          placeholder="印证议题（如 CoWoS 产能）"
        />
        <Input
          value={draft.sourceAnchor}
          onChange={(e) => onPatch({ sourceAnchor: e.target.value })}
          placeholder="原文来源锚点"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          value={draft.statement}
          onChange={(e) => onPatch({ statement: e.target.value })}
          placeholder="对方原话口径或数据"
        />
        <Input
          value={draft.takeaway}
          onChange={(e) => onPatch({ takeaway: e.target.value })}
          placeholder="交叉印证结论"
        />
      </div>
    </>
  );
}

export function AddCrossCheckForm({ onAdd }: { onAdd: (item: CrossCheck) => void }) {
  const [draft, setDraft] = useState<NewCheckDraft>(EMPTY_CHECK);
  const patch = (p: Partial<NewCheckDraft>) => setDraft((prev) => ({ ...prev, ...p }));
  const canAdd = Boolean(draft.peerCompany.trim() && draft.topic.trim() && draft.statement.trim());

  function handleSubmit() {
    if (!canAdd) return;
    onAdd(buildCrossCheckFromDraft(draft));
    setDraft(EMPTY_CHECK);
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="text-sm font-semibold text-ink-primary">新增上下游交叉印证</div>
      <CrossCheckInputs draft={draft} onPatch={patch} />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleSubmit} disabled={!canAdd}>
          <IconPlus size={14} stroke={1.5} />
          <span>加入对照表</span>
        </Button>
      </div>
    </Card>
  );
}
