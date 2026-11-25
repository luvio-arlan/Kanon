"use client";

import type { CreateDisciplineEntryInput, EmotionState, TradeAction } from "@kanon/core";
import { Card, Input, Textarea } from "@kanon/ui";
import { IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { DisciplineSignatureStrip, EmotionAndPriceRow, TradeActionRow } from "./discipline-fields";

interface FormState {
  action: TradeAction;
  emotion: EmotionState;
  noLeverage: boolean;
  positionCap: boolean;
  priceAnchor: number;
  weightDelta: string;
  syncPosition: boolean;
  exitRule: string;
  note: string;
}

const initialForm = (price: number, rule?: string | null): FormState => ({
  action: "hold",
  emotion: "calm",
  noLeverage: true,
  positionCap: true,
  priceAnchor: price,
  weightDelta: "",
  syncPosition: true,
  exitRule: rule ?? "",
  note: "",
});

function toEntryPayload(form: FormState, defaultPrice: number): CreateDisciplineEntryInput {
  const deltaNum = Number(form.weightDelta);
  const hasDelta =
    (form.action === "buy" || form.action === "add" || form.action === "trim") &&
    Number.isFinite(deltaNum) &&
    deltaNum > 0;
  return {
    action: form.action,
    emotion: form.emotion,
    noLeverageConfirmed: form.noLeverage,
    positionCapConfirmed: form.positionCap,
    priceAnchor: form.priceAnchor > 0 ? form.priceAnchor : defaultPrice,
    ...(hasDelta
      ? {
          weightDeltaPct: form.action === "trim" ? -deltaNum : deltaNum,
          syncPosition: form.syncPosition,
        }
      : {}),
    exitRule: form.exitRule.trim(),
    note: form.note.trim(),
  };
}

function ExitRuleFields(props: {
  exitRule: string;
  note: string;
  redTeamHint?: string;
  onExitRule: (next: string) => void;
  onNote: (next: string) => void;
}) {
  return (
    <div className="divide-y divide-hairline overflow-hidden rounded-panel border border-hairline bg-canvas/35">
      <div className="space-y-2 px-4 py-3.5 transition-colors focus-within:bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="disc-exit-rule" className="text-xs font-medium text-ink-muted">
            预设离场条件
          </label>
          {props.redTeamHint && !props.exitRule.trim() ? (
            <button
              type="button"
              onClick={() => props.onExitRule(props.redTeamHint ?? "")}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
            >
              <IconSparkles size={13} stroke={1.5} />
              <span>引用空头质询条件</span>
            </button>
          ) : null}
        </div>
        <Textarea
          id="disc-exit-rule"
          variant="editorial"
          value={props.exitRule}
          onChange={(e) => props.onExitRule(e.target.value)}
          placeholder="例如：连续两季毛利率跌破阈值则无条件减仓复盘…"
          className="min-h-[68px]"
        />
      </div>
      <div className="px-4 py-3 transition-colors focus-within:bg-surface">
        <Input
          variant="editorial"
          value={props.note}
          onChange={(e) => props.onNote(e.target.value)}
          placeholder="决策备忘…"
        />
      </div>
    </div>
  );
}

export interface DecisionComposerCardProps {
  defaultPrice: number;
  initialExitRule?: string | null;
  submitting: boolean;
  redTeamExitSuggestion?: string;
  canCollapse: boolean;
  onClose: () => void;
  onSubmit: (entry: CreateDisciplineEntryInput) => Promise<boolean | undefined>;
}

function WeightSyncRow({
  action,
  weightDelta,
  syncPosition,
  onDelta,
  onSync,
}: {
  action: TradeAction;
  weightDelta: string;
  syncPosition: boolean;
  onDelta: (v: string) => void;
  onSync: (v: boolean) => void;
}) {
  if (action !== "buy" && action !== "add" && action !== "trim") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-hairline bg-canvas/35 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-ink-muted">本次{action === "trim" ? "减仓" : "增仓"}比例 (%)</span>
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={weightDelta}
          onChange={(e) => onDelta(e.target.value)}
          placeholder="如 3.0"
          className="h-7 w-24 font-mono text-xs tabular-nums"
        />
      </div>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-ink-secondary">
        <input
          type="checkbox"
          checked={syncPosition}
          onChange={(e) => onSync(e.target.checked)}
          className="accent-accent-coral"
        />
        <span>自动重算持仓权重与均价</span>
      </label>
    </div>
  );
}

export function DecisionComposerCard(props: DecisionComposerCardProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialForm(props.defaultPrice, props.initialExitRule),
  );
  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const blocked = form.action !== "pass" && !form.noLeverage;
  const handleSave = async () => {
    if (blocked || !form.exitRule.trim()) return;
    if ((await props.onSubmit(toEntryPayload(form, props.defaultPrice))) === false) return;
    patch({ exitRule: "", note: "", weightDelta: "" });
    props.onClose();
  };
  return (
    <Card className="space-y-5 p-6">
      <TradeActionRow action={form.action} onAction={(action) => patch({ action })} />
      <EmotionAndPriceRow
        emotion={form.emotion}
        priceAnchor={form.priceAnchor}
        onEmotion={(emotion) => patch({ emotion })}
        onPrice={(priceAnchor) => patch({ priceAnchor })}
      />
      <WeightSyncRow
        action={form.action}
        weightDelta={form.weightDelta}
        syncPosition={form.syncPosition}
        onDelta={(weightDelta) => patch({ weightDelta })}
        onSync={(syncPosition) => patch({ syncPosition })}
      />
      <ExitRuleFields
        exitRule={form.exitRule}
        note={form.note}
        redTeamHint={props.redTeamExitSuggestion}
        onExitRule={(exitRule) => patch({ exitRule })}
        onNote={(note) => patch({ note })}
      />
      <DisciplineSignatureStrip
        noLeverage={form.noLeverage}
        positionCap={form.positionCap}
        blocked={blocked}
        submitting={props.submitting}
        canSubmit={Boolean(form.exitRule.trim())}
        onNoLeverage={(noLeverage) => patch({ noLeverage })}
        onPositionCap={(positionCap) => patch({ positionCap })}
        onCancel={props.canCollapse ? props.onClose : undefined}
        onSave={handleSave}
      />
    </Card>
  );
}
