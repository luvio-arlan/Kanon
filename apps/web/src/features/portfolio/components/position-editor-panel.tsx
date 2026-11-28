"use client";

import {
  type KellyWeightSuggestion,
  type PortfolioRole,
  suggestKellyCappedWeight,
  type ThesisDetail,
} from "@kanon/core";
import { Badge, Button, cn, formatMoney, Input } from "@kanon/ui";
import { IconAdjustmentsHorizontal, IconCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { apiUpdatePortfolioPosition } from "../lib/portfolio-api";

export interface PositionEditorPanelProps {
  thesis: ThesisDetail;
  onUpdated: (updated: ThesisDetail) => void;
}

const ROLE_OPTIONS: ReadonlyArray<{ id: PortfolioRole; label: string }> = [
  { id: "watchlist", label: "观察名单" },
  { id: "starter", label: "试探仓" },
  { id: "core", label: "核心持仓" },
  { id: "exited", label: "已清仓" },
];
const roleLabelOf = (role: PortfolioRole) =>
  ROLE_OPTIONS.find((opt) => opt.id === role)?.label ?? role;

interface PositionDraft {
  role: PortfolioRole;
  weight: string;
  cap: string;
  cost: string;
}

const toDraft = (t: ThesisDetail): PositionDraft => ({
  role: t.portfolioRole,
  weight: String(t.currentWeightPct),
  cap: String(t.targetMaxWeightPct),
  cost: t.avgCostBasis !== null ? String(t.avgCostBasis) : "",
});

function PositionSummaryGrid({
  thesis,
  kelly,
}: {
  thesis: ThesisDetail;
  kelly: KellyWeightSuggestion;
}) {
  const cells = [
    {
      label: "当前 / 上限",
      val: `${thesis.currentWeightPct}% / ${thesis.targetMaxWeightPct}%`,
      cls: "text-ink-primary",
    },
    {
      label: "持仓均价",
      val: thesis.avgCostBasis
        ? formatMoney(thesis.avgCostBasis, "USD", { maximumFractionDigits: 1 })
        : "未建仓",
      cls: "text-ink-primary",
    },
    { label: "半凯利建议", val: `${kelly.minPct}%–${kelly.maxPct}%`, cls: "text-status-pass" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
      {cells.map((c) => (
        <div key={c.label} className="rounded-control bg-muted/50 px-2.5 py-2">
          <div className="font-sans text-ink-muted">{c.label}</div>
          <div className={`mt-0.5 font-semibold ${c.cls}`}>{c.val}</div>
        </div>
      ))}
    </div>
  );
}

function PositionNumericInputs({
  draft,
  onPatch,
}: {
  draft: PositionDraft;
  onPatch: (p: Partial<PositionDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { id: "pos-weight", label: "当前仓位 (%)", key: "weight" as const, step: 0.5, ph: "0" },
        { id: "pos-cap", label: "单票上限 (%)", key: "cap" as const, step: 1, ph: "15" },
        { id: "pos-cost", label: "持仓成本 (USD)", key: "cost" as const, step: 0.5, ph: "可选" },
      ].map((f) => (
        <div key={f.id} className="space-y-1">
          <label htmlFor={f.id} className="text-xs text-ink-muted">
            {f.label}
          </label>
          <Input
            id={f.id}
            type="number"
            min={0}
            step={f.step}
            value={draft[f.key]}
            onChange={(e) => onPatch({ [f.key]: e.target.value })}
            placeholder={f.ph}
            className="h-8 font-mono text-xs tabular-nums"
          />
        </div>
      ))}
    </div>
  );
}

function PositionEditForm(p: {
  draft: PositionDraft;
  saving: boolean;
  rationale: string;
  onPatch: (patch: Partial<PositionDraft>) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className="space-y-3 border-t border-hairline pt-3">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => p.onPatch({ role: opt.id })}
            className={cn(
              "cursor-pointer rounded-pill border px-2.5 py-1 text-xs transition-colors",
              p.draft.role === opt.id
                ? "border-ink-primary bg-ink-primary font-medium text-ink-inverse"
                : "border-hairline bg-surface text-ink-secondary hover:border-strong",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <PositionNumericInputs draft={p.draft} onPatch={p.onPatch} />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 text-xs leading-relaxed text-ink-muted">{p.rationale}</span>
        <Button
          variant="titanium"
          size="sm"
          disabled={p.saving}
          onClick={() => void p.onSave()}
          className="shrink-0 whitespace-nowrap"
        >
          <IconCheck size={13} stroke={1.5} />
          <span>{p.saving ? "保存中..." : "保存仓位"}</span>
        </Button>
      </div>
    </div>
  );
}

function PositionPanelHeader(p: {
  role: PortfolioRole;
  overCap: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink-primary">组合仓位与纪律上限</span>
        <Badge variant={p.overCap ? "fail" : "titanium"}>{roleLabelOf(p.role)}</Badge>
        {p.overCap ? <Badge variant="warn">超上限</Badge> : null}
      </div>
      <button
        type="button"
        onClick={p.onToggle}
        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary"
      >
        <IconAdjustmentsHorizontal size={13} stroke={1.5} />
        <span>{p.expanded ? "收起" : "编辑仓位"}</span>
      </button>
    </div>
  );
}

function usePositionEditor(thesis: ThesisDetail, onUpdated: (updated: ThesisDetail) => void) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<PositionDraft>(() => toDraft(thesis));

  useEffect(() => {
    setDraft(toDraft(thesis));
  }, [thesis]);

  async function handleSave() {
    const parsedCost = Number(draft.cost);
    setSaving(true);
    const updated = await apiUpdatePortfolioPosition(thesis.id, {
      portfolioRole: draft.role,
      currentWeightPct: Math.max(0, Math.min(100, Number(draft.weight) || 0)),
      targetMaxWeightPct: Math.max(1, Math.min(100, Number(draft.cap) || 15)),
      avgCostBasis: draft.cost.trim() && parsedCost > 0 ? parsedCost : null,
    }).finally(() => setSaving(false));
    if (updated) {
      onUpdated(updated);
      setExpanded(false);
    }
  }
  return { expanded, setExpanded, saving, draft, setDraft, handleSave };
}

export function PositionEditorPanel({ thesis, onUpdated }: PositionEditorPanelProps) {
  const ed = usePositionEditor(thesis, onUpdated);
  const kelly = suggestKellyCappedWeight(thesis);
  const overCap = thesis.currentWeightPct > thesis.targetMaxWeightPct;

  return (
    <div className="space-y-3 rounded-card border border-hairline bg-surface p-4">
      <PositionPanelHeader
        role={thesis.portfolioRole}
        overCap={overCap}
        expanded={ed.expanded}
        onToggle={() => ed.setExpanded((v) => !v)}
      />
      <PositionSummaryGrid thesis={thesis} kelly={kelly} />
      {ed.expanded ? (
        <PositionEditForm
          draft={ed.draft}
          saving={ed.saving}
          rationale={kelly.rationale}
          onPatch={(p) => ed.setDraft((prev) => ({ ...prev, ...p }))}
          onSave={ed.handleSave}
        />
      ) : null}
    </div>
  );
}
