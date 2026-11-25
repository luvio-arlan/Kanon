"use client";

import type { CrossCheck, Hypothesis, ThesisSummary } from "@kanon/core";
import { ActionMenu, cn } from "@kanon/ui";
import { IconGitBranch, IconLink } from "@tabler/icons-react";

const ALIGN_DOT: Record<CrossCheck["alignment"], string> = {
  aligned: "bg-status-pass",
  divergent: "bg-status-fail",
  pending: "bg-status-warn",
};

export function HypothesisLinkPicker(props: {
  hypotheses: readonly Hypothesis[];
  value: string | null | undefined;
  onSelect: (hypothesisId: string | null) => void;
}) {
  if (props.hypotheses.length === 0) return null;
  const idx = props.hypotheses.findIndex((h) => h.id === props.value);
  const label = idx >= 0 ? `H${idx + 1}` : "挂载假设";
  return (
    <ActionMenu
      ariaLabel="挂载核心假设"
      items={[
        { id: "none", label: "不挂载假设", onSelect: () => props.onSelect(null) },
        ...props.hypotheses.map((h, i) => ({
          id: h.id,
          label: `H${i + 1} · ${h.title.slice(0, 22) || "未命名假设"}`,
          selected: h.id === props.value,
          onSelect: () => props.onSelect(h.id),
        })),
      ]}
      trigger={
        <>
          <IconGitBranch size={13} stroke={1.5} />
          <span>{label}</span>
        </>
      }
    />
  );
}

export function LinkThesisPicker(props: {
  linkableTheses: readonly ThesisSummary[];
  linkedThesisId: string | null;
  peerCompany: string;
  onSelect: (thesis: ThesisSummary | null) => void;
}) {
  if (props.linkableTheses.length === 0) return null;
  const linked = props.linkableTheses.find((t) => t.id === props.linkedThesisId);
  return (
    <ActionMenu
      ariaLabel="关联库内标的"
      items={[
        { id: "none", label: "不关联", onSelect: () => props.onSelect(null) },
        ...props.linkableTheses.map((t) => ({
          id: t.id,
          label: `${t.companyName} (${t.ticker})`,
          selected: t.id === props.linkedThesisId,
          onSelect: () => props.onSelect(t),
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

export function HypothesisLinkedEvidence({ checks }: { checks: readonly CrossCheck[] }) {
  if (checks.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-canvas/35 px-6 py-2.5 sm:px-7">
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-ink-muted">
        <IconGitBranch size={12} stroke={1.5} />
        <span>已挂载 {checks.length} 条印证</span>
      </span>
      {checks.map((cc) => (
        <span
          key={cc.id}
          title={`${cc.peerCompany} · ${cc.topic}`}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface px-2.5 py-0.5 text-xs text-ink-secondary"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", ALIGN_DOT[cc.alignment])} />
          <span className="max-w-[160px] truncate">{cc.peerCompany}</span>
        </span>
      ))}
    </div>
  );
}
