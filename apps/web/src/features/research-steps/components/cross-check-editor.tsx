"use client";

import type { CrossCheck, GlossaryTerm, ThesisSummary } from "@kanon/core";
import { ActionMenu, Badge, Button, ButtonGroup, ButtonGroupItem, Card, Input } from "@kanon/ui";
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
          title="切换口径一致状态"
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
            <span>联动</span>
            <IconArrowUpRight size={11} stroke={1.5} />
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="删除对照项"
        onClick={onDelete}
        className="cursor-pointer rounded-item p-1 text-ink-muted opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-muted hover:text-status-fail focus-visible:opacity-100 group-hover/cc:opacity-100"
      >
        <IconTrash size={14} stroke={1.5} />
      </button>
    </div>
  );
}

export function CrossCheckItemCard(p: {
  cc: CrossCheck;
  glossary: readonly GlossaryTerm[];
  onCycleAlignment: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/cc space-y-2 px-6 py-5 sm:px-7">
      <CrossCheckHeaderRow cc={p.cc} onCycleAlignment={p.onCycleAlignment} onDelete={p.onDelete} />
      <div className="text-xs text-ink-muted">
        {p.cc.topic} · {p.cc.sourceAnchor}
      </div>
      <div className="text-sm leading-[1.7] text-ink-primary">
        <GlossaryText text={p.cc.statement} terms={p.glossary} />
      </div>
      {p.cc.takeaway ? (
        <p className="text-xs leading-relaxed text-ink-secondary">{p.cc.takeaway}</p>
      ) : null}
    </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-3.5 sm:px-7">
      <ButtonGroup ariaLabel="上下游角色">
        {ROLE_OPTIONS.map((opt) => (
          <ButtonGroupItem
            key={opt.id}
            size="sm"
            selected={draft.peerRole === opt.id}
            onClick={() => onPatch({ peerRole: opt.id })}
          >
            {opt.label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
      <ButtonGroup ariaLabel="口径一致度">
        {ALIGN_CYCLE.map((align) => (
          <ButtonGroupItem
            key={align}
            size="sm"
            tone={align === "aligned" ? "pass" : align === "divergent" ? "fail" : "warn"}
            showDot
            selected={draft.alignment === align}
            onClick={() => onPatch({ alignment: align })}
          >
            {ALIGN_META[align].label}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  );
}

function DraftInputsGrid(p: {
  draft: NewCheckDraft;
  onPatch: (v: Partial<NewCheckDraft>) => void;
}) {
  return (
    <div className="divide-y divide-hairline">
      <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {TOP_CHECK_FIELDS.map((f) => (
          <div key={f.key} className="px-6 py-3.5 transition-colors focus-within:bg-canvas/45">
            <Input
              variant="editorial"
              value={p.draft[f.key]}
              onChange={(e) => p.onPatch({ [f.key]: e.target.value })}
              placeholder={f.ph}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {BOTTOM_CHECK_FIELDS.map((f) => (
          <div key={f.key} className="px-6 py-3.5 transition-colors focus-within:bg-canvas/45">
            <Input
              variant="editorial"
              value={p.draft[f.key]}
              onChange={(e) => p.onPatch({ [f.key]: e.target.value })}
              placeholder={f.ph}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkThesisPicker(p: {
  linkableTheses: readonly ThesisSummary[];
  draft: NewCheckDraft;
  onPatch: (v: Partial<NewCheckDraft>) => void;
}) {
  if (p.linkableTheses.length === 0) return null;
  const linked = p.linkableTheses.find((t) => t.id === p.draft.linkedThesisId);
  return (
    <ActionMenu
      ariaLabel="关联库内标的"
      items={[
        { id: "none", label: "不关联", onSelect: () => p.onPatch({ linkedThesisId: null }) },
        ...p.linkableTheses.map((t) => ({
          id: t.id,
          label: `${t.companyName} (${t.ticker})`,
          selected: t.id === p.draft.linkedThesisId,
          onSelect: () =>
            p.onPatch({
              linkedThesisId: t.id,
              peerCompany: p.draft.peerCompany.trim() || `${t.companyName}（${t.ticker}）`,
            }),
        })),
      ]}
      trigger={
        <>
          <IconLink size={13} stroke={1.5} />
          <span>{linked ? linked.ticker : "关联标的"}</span>
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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewCheckDraft>(EMPTY_CHECK);
  const patch = (p: Partial<NewCheckDraft>) => setDraft((prev) => ({ ...prev, ...p }));
  const canAdd = Boolean(draft.peerCompany.trim() && draft.topic.trim() && draft.statement.trim());
  const handleSubmit = () => {
    if (!canAdd) return;
    onAdd(buildCrossCheckFromDraft(draft));
    setDraft(EMPTY_CHECK);
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-panel border border-hairline bg-surface/60 py-3 text-xs font-medium text-ink-secondary transition-colors duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-surface hover:text-ink-primary"
      >
        <IconPlus size={14} stroke={1.5} />
        <span>新增上下游交叉印证</span>
      </button>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-6 py-3.5 sm:px-7">
        <span className="text-sm font-semibold text-ink-primary">新增上下游交叉印证</span>
        <LinkThesisPicker linkableTheses={linkableTheses} draft={draft} onPatch={patch} />
      </div>
      <RoleAndAlignPicker draft={draft} onPatch={patch} />
      <DraftInputsGrid draft={draft} onPatch={patch} />
      <div className="flex items-center justify-end gap-2 border-t border-hairline px-6 py-3 sm:px-7">
        <Button variant="ghost" size="xs" onClick={() => setOpen(false)}>
          取消
        </Button>
        <Button variant="primary" size="xs" onClick={handleSubmit} disabled={!canAdd}>
          <IconPlus size={13} stroke={1.5} />
          <span>加入对照表</span>
        </Button>
      </div>
    </Card>
  );
}
