"use client";

import type { InvestmentMemo } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  EmotionState,
  ThesisDetail,
  TradeAction,
} from "@kanon/core";
import { Card, Input, Textarea } from "@kanon/ui";
import { IconShieldCheck } from "@tabler/icons-react";
import { useState } from "react";
import {
  ActionAndIronSwitches,
  DisciplineSubmitFooter,
  EmotionAndPriceRow,
} from "./discipline-fields";
import { DisciplineTimeline } from "./discipline-timeline";
import { InvestmentMemoCard } from "./investment-memo-card";

export interface DisciplineJournalProps {
  thesis: ThesisDetail;
  submitting: boolean;
  memoLoading: boolean;
  investmentMemo: InvestmentMemo | null;
  redTeamExitSuggestion?: string;
  onSubmitDiscipline: (entry: CreateDisciplineEntryInput) => Promise<void>;
  onGenerateMemo: () => Promise<void>;
}

interface FormState {
  action: TradeAction;
  emotion: EmotionState;
  noLeverage: boolean;
  positionCap: boolean;
  priceAnchor: number;
  exitRule: string;
  note: string;
}

function ChecklistHeader() {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-ink-primary">交易前铁律检查单</h3>
        <p className="mt-0.5 text-xs text-ink-secondary">
          每次仓位动作前强制核对零杠杆铁律与认错红线，拒绝情绪化交易
        </p>
      </div>
      <IconShieldCheck size={20} stroke={1.5} className="text-status-pass" />
    </div>
  );
}

function createInitialForm(defaultPrice: number): FormState {
  return {
    action: "hold",
    emotion: "calm",
    noLeverage: true,
    positionCap: true,
    priceAnchor: defaultPrice,
    exitRule: "",
    note: "",
  };
}

function toDisciplineInput(form: FormState, defaultPrice: number): CreateDisciplineEntryInput {
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

function ExitRuleInputs(props: {
  exitRule: string;
  note: string;
  onExitRule: (next: string) => void;
  onNote: (next: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Textarea
        value={props.exitRule}
        onChange={(e) => props.onExitRule(e.target.value)}
        placeholder="必填 · 认错离场条件（例如：若连续两季毛利率跌破 38% 或扩产失控，无条件减半仓复盘）"
      />
      <Input
        value={props.note}
        onChange={(e) => props.onNote(e.target.value)}
        placeholder="补充决策备忘录（可选）..."
      />
    </div>
  );
}

interface ChecklistCardProps {
  defaultPrice: number;
  submitting: boolean;
  redTeamExitSuggestion?: string;
  onSubmit: (entry: CreateDisciplineEntryInput) => Promise<void>;
}

function RedTeamExitHint({
  suggestion,
  onApply,
}: {
  suggestion?: string;
  onApply: (text: string) => void;
}) {
  if (!suggestion) return null;
  return (
    <button
      type="button"
      onClick={() => onApply(suggestion)}
      className="w-full cursor-pointer rounded-control border border-dashed border-accent-coral/40 bg-accent-coral-soft/40 px-3.5 py-2 text-left text-xs text-ink-primary transition-colors hover:bg-accent-coral-soft/70"
    >
      一键带入红队致命证伪路径作为离场红线：{suggestion}
    </button>
  );
}

function DisciplineChecklistCard(props: ChecklistCardProps) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(props.defaultPrice));
  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const blocked = form.action !== "pass" && !form.noLeverage;

  async function handleSave() {
    if (blocked || !form.exitRule.trim()) return;
    await props.onSubmit(toDisciplineInput(form, props.defaultPrice));
    patch({ exitRule: "", note: "" });
  }

  return (
    <Card className="space-y-5 p-6">
      <ChecklistHeader />
      <ActionAndIronSwitches
        action={form.action}
        noLeverage={form.noLeverage}
        positionCap={form.positionCap}
        onAction={(action) => patch({ action })}
        onNoLeverage={(noLeverage) => patch({ noLeverage })}
        onPositionCap={(positionCap) => patch({ positionCap })}
      />
      <EmotionAndPriceRow
        emotion={form.emotion}
        priceAnchor={form.priceAnchor}
        onEmotion={(emotion) => patch({ emotion })}
        onPrice={(priceAnchor) => patch({ priceAnchor })}
      />
      {!form.exitRule.trim() ? (
        <RedTeamExitHint
          suggestion={props.redTeamExitSuggestion}
          onApply={(exitRule) => patch({ exitRule })}
        />
      ) : null}
      <ExitRuleInputs
        exitRule={form.exitRule}
        note={form.note}
        onExitRule={(exitRule) => patch({ exitRule })}
        onNote={(note) => patch({ note })}
      />
      <DisciplineSubmitFooter
        blocked={blocked}
        submitting={props.submitting}
        canSubmit={Boolean(form.exitRule.trim())}
        onSave={handleSave}
      />
    </Card>
  );
}

export function DisciplineJournal(props: DisciplineJournalProps) {
  return (
    <div className="space-y-6">
      <DisciplineChecklistCard
        defaultPrice={props.thesis.currentPrice}
        submitting={props.submitting}
        redTeamExitSuggestion={props.redTeamExitSuggestion}
        onSubmit={props.onSubmitDiscipline}
      />
      <DisciplineTimeline entries={props.thesis.disciplineEntries} />
      <InvestmentMemoCard
        thesisId={props.thesis.id}
        memo={props.investmentMemo}
        loading={props.memoLoading}
        onGenerate={props.onGenerateMemo}
      />
    </div>
  );
}
