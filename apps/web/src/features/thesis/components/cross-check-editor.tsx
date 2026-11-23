"use client";

import type { Alignment, CrossCheck, GlossaryTerm, PeerRole } from "@kanon/core";
import { Badge, Button, Card, cn, Input } from "@kanon/ui";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { GlossaryText } from "@/features/glossary";

const ROLE_OPTIONS: ReadonlyArray<{ id: PeerRole; label: string }> = [
  { id: "upstream", label: "上游供给" },
  { id: "downstream", label: "下游客户" },
  { id: "competitor", label: "直接竞对" },
  { id: "primary", label: "本公司一阶" },
];

const ALIGN_CYCLE: Alignment[] = ["aligned", "divergent", "pending"];

const ALIGN_META: Record<Alignment, { label: string; variant: "pass" | "fail" | "warn" }> = {
  aligned: { label: "口径一致", variant: "pass" },
  divergent: { label: "存在分歧", variant: "fail" },
  pending: { label: "待继续核实", variant: "warn" },
};

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.id, r.label]));

interface NewCheckDraft {
  peerCompany: string;
  peerRole: PeerRole;
  alignment: Alignment;
  topic: string;
  sourceAnchor: string;
  statement: string;
  takeaway: string;
}

const EMPTY_CHECK: NewCheckDraft = {
  peerCompany: "",
  peerRole: "downstream",
  alignment: "aligned",
  topic: "",
  sourceAnchor: "",
  statement: "",
  takeaway: "",
};

export function CrossCheckItemCard({
  cc,
  glossary,
  onCycleAlignment,
  onDelete,
}: {
  cc: CrossCheck;
  glossary: readonly GlossaryTerm[];
  onCycleAlignment: () => void;
  onDelete: () => void;
}) {
  const align = ALIGN_META[cc.alignment];
  return (
    <Card className="space-y-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-primary">{cc.peerCompany}</span>
          <Badge variant="titanium">{ROLE_LABELS[cc.peerRole]}</Badge>
          <button
            type="button"
            onClick={onCycleAlignment}
            title="点击切换口径一致状态"
            className="cursor-pointer"
          >
            <Badge variant={align.variant}>{align.label}</Badge>
          </button>
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
      <div className="text-sm leading-relaxed text-ink-primary">
        <GlossaryText text={cc.statement} terms={glossary} />
      </div>
      <p className="text-xs text-ink-secondary">结论：{cc.takeaway}</p>
    </Card>
  );
}

export function nextAlignment(current: Alignment): Alignment {
  const idx = ALIGN_CYCLE.indexOf(current);
  return ALIGN_CYCLE[(idx + 1) % ALIGN_CYCLE.length] ?? "pending";
}

function RoleAndAlignPicker({
  draft,
  onPatch,
}: {
  draft: NewCheckDraft;
  onPatch: (p: Partial<NewCheckDraft>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onPatch({ peerRole: opt.id })}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
              draft.peerRole === opt.id
                ? "border-ink-primary bg-ink-primary text-ink-inverse"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {ALIGN_CYCLE.map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => onPatch({ alignment: align })}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors",
              draft.alignment === align
                ? "border-accent-coral bg-accent-coral-soft text-accent-coral"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {ALIGN_META[align].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildCrossCheckFromDraft(draft: NewCheckDraft): CrossCheck {
  return {
    id: `cc-${Date.now()}`,
    peerCompany: draft.peerCompany.trim(),
    peerRole: draft.peerRole,
    topic: draft.topic.trim(),
    sourceAnchor: draft.sourceAnchor.trim() || "季报电话会 / SEC 披露",
    statement: draft.statement.trim(),
    alignment: draft.alignment,
    takeaway: draft.takeaway.trim() || "与核心假设形成产业链交叉互证。",
  };
}

function DraftInputsGrid({
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
      <RoleAndAlignPicker draft={draft} onPatch={patch} />
      <DraftInputsGrid draft={draft} onPatch={patch} />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleSubmit} disabled={!canAdd}>
          <IconPlus size={14} stroke={1.5} />
          <span>加入对照表</span>
        </Button>
      </div>
    </Card>
  );
}
