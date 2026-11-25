"use client";

import type { CrossCheck, Hypothesis, ThesisSummary } from "@kanon/core";
import { Button, ButtonGroup, ButtonGroupItem, Card, Input } from "@kanon/ui";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import {
  ALIGN_CYCLE,
  ALIGN_META,
  BOTTOM_CHECK_FIELDS,
  buildCrossCheckFromDraft,
  EMPTY_CHECK,
  type NewCheckDraft,
  nextAlignment,
  ROLE_OPTIONS,
  TOP_CHECK_FIELDS,
} from "../lib/cross-check-helpers";
import { HypothesisLinkPicker, LinkThesisPicker } from "./lineage/hypothesis-link-controls";

export { CrossCheckItemCard } from "./lineage/cross-check-item-card";
export { nextAlignment };

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

function AddCheckFormHeader(p: {
  linkableTheses: readonly ThesisSummary[];
  hypotheses: readonly Hypothesis[];
  draft: NewCheckDraft;
  onPatch: (v: Partial<NewCheckDraft>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-6 py-3.5 sm:px-7">
      <span className="text-sm font-semibold text-ink-primary">新增上下游交叉印证</span>
      <div className="flex items-center gap-2">
        <HypothesisLinkPicker
          hypotheses={p.hypotheses}
          value={p.draft.hypothesisId}
          onSelect={(hypothesisId) => p.onPatch({ hypothesisId })}
        />
        <LinkThesisPicker
          linkableTheses={p.linkableTheses}
          linkedThesisId={p.draft.linkedThesisId}
          peerCompany={p.draft.peerCompany}
          onSelect={(t) =>
            p.onPatch({
              linkedThesisId: t?.id ?? null,
              peerCompany:
                t && !p.draft.peerCompany.trim()
                  ? `${t.companyName}（${t.ticker}）`
                  : p.draft.peerCompany,
            })
          }
        />
      </div>
    </div>
  );
}

function AddCheckFooter(p: { canAdd: boolean; onCancel: () => void; onSubmit: () => void }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-hairline px-6 py-3 sm:px-7">
      <Button variant="ghost" size="xs" onClick={p.onCancel}>
        取消
      </Button>
      <Button variant="primary" size="xs" onClick={p.onSubmit} disabled={!p.canAdd}>
        <IconPlus size={13} stroke={1.5} />
        <span>加入对照表</span>
      </Button>
    </div>
  );
}

export function AddCrossCheckForm({
  linkableTheses = [],
  hypotheses = [],
  onAdd,
}: {
  linkableTheses?: readonly ThesisSummary[];
  hypotheses?: readonly Hypothesis[];
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
      <AddCheckFormHeader
        linkableTheses={linkableTheses}
        hypotheses={hypotheses}
        draft={draft}
        onPatch={patch}
      />
      <RoleAndAlignPicker draft={draft} onPatch={patch} />
      <DraftInputsGrid draft={draft} onPatch={patch} />
      <AddCheckFooter canAdd={canAdd} onCancel={() => setOpen(false)} onSubmit={handleSubmit} />
    </Card>
  );
}
