"use client";

import type { CrossCheck, GlossaryTerm, ThesisSummary } from "@kanon/core";
import { ActionMenu, Badge, Button, Card, cn, Input } from "@kanon/ui";
import { IconArrowUpRight, IconLink, IconPlus, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useState } from "react";
import { GlossaryText } from "@/features/glossary";
import {
  ALIGN_CYCLE,
  ALIGN_META,
  BOTTOM_CHECK_FIELDS,
  buildCrossCheckFromDraft,
  EMPTY_CHECK,
  type NewCheckDraft,
  nextAlignment,
  ROLE_LABELS,
  ROLE_OPTIONS,
  TOP_CHECK_FIELDS,
} from "../lib/cross-check-helpers";

export { nextAlignment };

function CrossCheckHeaderRow({
  cc,
  onCycleAlignment,
  onDelete,
}: {
  cc: CrossCheck;
  onCycleAlignment: () => void;
  onDelete: () => void;
}) {
  const align = ALIGN_META[cc.alignment];
  return (
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
        {cc.linkedThesisId ? (
          <Link
            href={`/thesis/${cc.linkedThesisId}`}
            className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-muted/60 px-2 py-0.5 text-xs text-ink-secondary hover:border-strong hover:text-ink-primary"
          >
            <IconLink size={11} stroke={1.5} />
            <span>联动档案</span>
            <IconArrowUpRight size={11} stroke={1.5} />
          </Link>
        ) : null}
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
  );
}

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
  return (
    <Card className="space-y-2 p-5">
      <CrossCheckHeaderRow cc={cc} onCycleAlignment={onCycleAlignment} onDelete={onDelete} />
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

function DraftInputsGrid({
  draft,
  onPatch,
}: {
  draft: NewCheckDraft;
  onPatch: (p: Partial<NewCheckDraft>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TOP_CHECK_FIELDS.map((f) => (
          <Input
            key={f.key}
            value={draft[f.key]}
            onChange={(e) => onPatch({ [f.key]: e.target.value })}
            placeholder={f.ph}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BOTTOM_CHECK_FIELDS.map((f) => (
          <Input
            key={f.key}
            value={draft[f.key]}
            onChange={(e) => onPatch({ [f.key]: e.target.value })}
            placeholder={f.ph}
          />
        ))}
      </div>
    </div>
  );
}

function LinkThesisPicker({
  linkableTheses,
  draft,
  onPatch,
}: {
  linkableTheses: readonly ThesisSummary[];
  draft: NewCheckDraft;
  onPatch: (p: Partial<NewCheckDraft>) => void;
}) {
  if (linkableTheses.length === 0) return null;
  const linked = linkableTheses.find((t) => t.id === draft.linkedThesisId);
  return (
    <ActionMenu
      ariaLabel="关联库内标的"
      items={[
        { id: "none", label: "不关联库内标的", onSelect: () => onPatch({ linkedThesisId: null }) },
        ...linkableTheses.map((t) => ({
          id: t.id,
          label: `${t.companyName} (${t.ticker})`,
          onSelect: () =>
            onPatch({
              linkedThesisId: t.id,
              peerCompany: draft.peerCompany.trim() || `${t.companyName}（${t.ticker}）`,
            }),
        })),
      ]}
      trigger={
        <>
          <IconLink size={13} stroke={1.5} />
          <span>{linked ? `已关联：${linked.ticker}` : "关联库内标的（可选）"}</span>
        </>
      }
    />
  );
}

export function AddCrossCheckForm({
  linkableTheses = [],
  onAdd,
}: {
  linkableTheses?: readonly ThesisSummary[];
  onAdd: (item: CrossCheck) => void;
}) {
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink-primary">新增上下游交叉印证</div>
        <LinkThesisPicker linkableTheses={linkableTheses} draft={draft} onPatch={patch} />
      </div>
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
