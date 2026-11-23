"use client";

import type { InvestmentMemo } from "@kanon/ai";
import type {
  CreateDisciplineEntryInput,
  EmotionState,
  ThesisDetail,
  TradeAction,
} from "@kanon/core";
import { Button, Card, Input, KANON_TRANSITION_FAST, SegmentedTabs, Textarea } from "@kanon/ui";
import { IconPlus, IconSparkles } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { DisciplineSignatureStrip, EmotionAndPriceRow, TradeActionRow } from "./discipline-fields";
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

type Step5Tab = "ledger" | "memo";

interface FormState {
  action: TradeAction;
  emotion: EmotionState;
  noLeverage: boolean;
  positionCap: boolean;
  priceAnchor: number;
  exitRule: string;
  note: string;
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

function toEntryInput(form: FormState, defaultPrice: number): CreateDisciplineEntryInput {
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

function DecisionComposerCard(props: {
  defaultPrice: number;
  submitting: boolean;
  redTeamExitSuggestion?: string;
  canCollapse: boolean;
  onClose: () => void;
  onSubmit: (entry: CreateDisciplineEntryInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(props.defaultPrice));
  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const blocked = form.action !== "pass" && !form.noLeverage;

  async function handleSave() {
    if (blocked || !form.exitRule.trim()) return;
    await props.onSubmit(toEntryInput(form, props.defaultPrice));
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

function LedgerTabView(props: {
  thesis: ThesisDetail;
  composerOpen: boolean;
  submitting: boolean;
  redTeamExitSuggestion?: string;
  onCloseComposer: () => void;
  onSubmitDiscipline: (entry: CreateDisciplineEntryInput) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <AnimatePresence initial={false}>
        {props.composerOpen ? (
          <motion.div
            key="composer"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={KANON_TRANSITION_FAST}
          >
            <DecisionComposerCard
              defaultPrice={props.thesis.currentPrice}
              submitting={props.submitting}
              redTeamExitSuggestion={props.redTeamExitSuggestion}
              canCollapse={props.thesis.disciplineEntries.length > 0}
              onClose={props.onCloseComposer}
              onSubmit={props.onSubmitDiscipline}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <DisciplineTimeline entries={props.thesis.disciplineEntries} />
    </div>
  );
}

export function DisciplineJournal(props: DisciplineJournalProps) {
  const [tab, setTab] = useState<Step5Tab>("ledger");
  const [composerOpen, setComposerOpen] = useState(props.thesis.disciplineEntries.length === 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          layoutId="step5-mode-tabs"
          value={tab}
          onChange={setTab}
          items={[
            { id: "ledger", label: "交易纪律台账", count: props.thesis.disciplineEntries.length },
            { id: "memo", label: "投研备忘录" },
          ]}
        />
        {tab === "ledger" ? (
          <Button variant="primary" size="sm" onClick={() => setComposerOpen((v) => !v)}>
            <IconPlus size={14} stroke={1.5} />
            <span>{composerOpen ? "收起记录单" : "记录新决策"}</span>
          </Button>
        ) : null}
      </div>
      {tab === "ledger" ? (
        <LedgerTabView
          thesis={props.thesis}
          composerOpen={composerOpen}
          submitting={props.submitting}
          redTeamExitSuggestion={props.redTeamExitSuggestion}
          onCloseComposer={() => setComposerOpen(false)}
          onSubmitDiscipline={props.onSubmitDiscipline}
        />
      ) : (
        <InvestmentMemoCard
          thesisId={props.thesis.id}
          memo={props.investmentMemo}
          loading={props.memoLoading}
          onGenerate={props.onGenerateMemo}
        />
      )}
    </div>
  );
}
