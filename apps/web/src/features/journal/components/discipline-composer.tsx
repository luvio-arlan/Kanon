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
  exitRule: string;
  note: string;
}

const initialForm = (price: number, rule?: string | null): FormState => ({
  action: "hold",
  emotion: "calm",
  noLeverage: true,
  positionCap: true,
  priceAnchor: price,
  exitRule: rule ?? "",
  note: "",
});

function toEntryPayload(form: FormState, defaultPrice: number): CreateDisciplineEntryInput {
  return {
    action: form.action,
    emotion: form.emotion,
    noLeverageConfirmed: form.noLeverage,
    positionCapConfirmed: form.positionCap,
    priceAnchor: form.priceAnchor > 0 ? form.priceAnchor : defaultPrice,
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
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="disc-exit-rule" className="text-xs text-ink-muted">
          认错离场红线（必填）
        </label>
        {props.redTeamHint && !props.exitRule.trim() ? (
          <button
            type="button"
            onClick={() => props.onExitRule(props.redTeamHint ?? "")}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral transition-opacity hover:opacity-80"
          >
            <IconSparkles size={13} stroke={1.5} />
            <span>引用红队证伪红线</span>
          </button>
        ) : null}
      </div>
      <Textarea
        id="disc-exit-rule"
        value={props.exitRule}
        onChange={(e) => props.onExitRule(e.target.value)}
        placeholder="若连续两季毛利率跌破阈值或资本开支失控，无条件减半仓复盘..."
        className="min-h-[76px]"
      />
      <Input
        value={props.note}
        onChange={(e) => props.onNote(e.target.value)}
        placeholder="补充决策备忘（可选）"
      />
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
  onSubmit: (entry: CreateDisciplineEntryInput) => Promise<void>;
}

export function DecisionComposerCard(props: DecisionComposerCardProps) {
  const [form, setForm] = useState<FormState>(() =>
    initialForm(props.defaultPrice, props.initialExitRule),
  );
  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const blocked = form.action !== "pass" && !form.noLeverage;

  async function handleSave() {
    if (blocked || !form.exitRule.trim()) return;
    await props.onSubmit(toEntryPayload(form, props.defaultPrice));
    patch({ exitRule: "", note: "" });
    props.onClose();
  }

  return (
    <Card className="space-y-5 p-6">
      <TradeActionRow action={form.action} onAction={(action) => patch({ action })} />
      <EmotionAndPriceRow
        emotion={form.emotion}
        priceAnchor={form.priceAnchor}
        onEmotion={(emotion) => patch({ emotion })}
        onPrice={(priceAnchor) => patch({ priceAnchor })}
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
