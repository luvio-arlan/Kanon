"use client";

import type { CrossCheck, GlossaryTerm, Hypothesis } from "@kanon/core";
import { Badge } from "@kanon/ui";
import { IconArrowUpRight, IconLink, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { GlossaryText } from "@/features/glossary";
import { ALIGN_META, ROLE_LABELS } from "../../lib/cross-check-helpers";
import { HypothesisLinkPicker } from "./hypothesis-link-controls";

function CheckMetaBadges({
  cc,
  onCycleAlignment,
}: {
  cc: CrossCheck;
  onCycleAlignment: () => void;
}) {
  const align = ALIGN_META[cc.alignment];
  return (
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
  );
}

function CrossCheckHeaderRow({
  cc,
  hypotheses,
  onCycleAlignment,
  onLinkHypothesis,
  onDelete,
}: {
  cc: CrossCheck;
  hypotheses: readonly Hypothesis[];
  onCycleAlignment: () => void;
  onLinkHypothesis?: (hypothesisId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CheckMetaBadges cc={cc} onCycleAlignment={onCycleAlignment} />
      <div className="flex items-center gap-1.5">
        {onLinkHypothesis ? (
          <HypothesisLinkPicker
            hypotheses={hypotheses}
            value={cc.hypothesisId}
            onSelect={onLinkHypothesis}
          />
        ) : null}
        <button
          type="button"
          aria-label="删除对照项"
          onClick={onDelete}
          className="cursor-pointer rounded-item p-1 text-ink-muted opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-muted hover:text-status-fail focus-visible:opacity-100 group-hover/cc:opacity-100"
        >
          <IconTrash size={14} stroke={1.5} />
        </button>
      </div>
    </div>
  );
}

export function CrossCheckItemCard(p: {
  cc: CrossCheck;
  glossary: readonly GlossaryTerm[];
  hypotheses?: readonly Hypothesis[];
  onCycleAlignment: () => void;
  onLinkHypothesis?: (hypothesisId: string | null) => void;
  onDelete: () => void;
}) {
  return (
    <div className="group/cc space-y-2 px-6 py-5 sm:px-7">
      <CrossCheckHeaderRow
        cc={p.cc}
        hypotheses={p.hypotheses ?? []}
        onCycleAlignment={p.onCycleAlignment}
        onLinkHypothesis={p.onLinkHypothesis}
        onDelete={p.onDelete}
      />
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
