"use client";

import type {
  GlossaryTerm,
  Hypothesis,
  RedTeamReport,
  SecAnnualFinancial,
  SecQuarterlyFinancial,
  ThesisCatalyst,
  ThesisDetail,
} from "@kanon/core";
import { AgentThinking, Button, KANON_LENS_VARIANTS, SegmentedTabs } from "@kanon/ui";
import { IconPlus, IconScale } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { type AutoSaveStatus, useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { buildExtraHypothesis, isHypothesisArray, swapHypotheses } from "../lib/hypothesis-helpers";
import { CatalystLedgerSection } from "./catalysts/catalyst-ledger-section";
import { HypothesisEditorCard } from "./hypothesis-editor-card";
import { RedTeamResultCard } from "./red-team-result-card";

type StepTwoLens = "hypotheses" | "catalysts";

export interface StepHypothesesProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  annuals?: readonly SecAnnualFinancial[];
  quarterlies?: readonly SecQuarterlyFinancial[];
  redTeamLoading: boolean;
  redTeam: RedTeamReport | null;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSave: (hypotheses: Hypothesis[]) => Promise<boolean>;
  onSaveCatalysts: (catalysts: ThesisCatalyst[]) => Promise<boolean>;
  onRunRedTeam: () => Promise<void>;
  onPromoteRedTeamRule?: (rule: string) => void;
}

function isValidHypotheses(items: readonly Hypothesis[]): boolean {
  return (
    items.length >= 3 &&
    items.length <= 5 &&
    items.every((h) => Boolean(h.title.trim() && h.metricLabel.trim() && h.threshold.trim()))
  );
}

function StepTwoHeader({ loading, onRun }: { loading: boolean; onRun: () => Promise<void> }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
        核心假设与催化剂
      </h1>
      <Button variant="coral" size="sm" loading={loading} onClick={onRun}>
        {!loading ? <IconScale size={15} stroke={1.5} /> : null}
        <span>{loading ? "推演中" : "反向质询"}</span>
      </Button>
    </header>
  );
}

function HypothesesRedTeamSlot({
  loading,
  report,
  onPromote,
}: {
  loading: boolean;
  report: RedTeamReport | null;
  onPromote?: (rule: string) => void;
}) {
  return (
    <>
      {loading ? (
        <div className="rounded-panel border border-hairline bg-surface px-5 py-4 shadow-card">
          <AgentThinking variant="stars" label="正在从空头视角审视核心假设盲区" />
        </div>
      ) : null}
      {report ? <RedTeamResultCard report={report} onPromoteRule={onPromote} /> : null}
    </>
  );
}

function AddHypothesisButton({ visible, onAdd }: { visible: boolean; onAdd: () => void }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-panel border border-hairline bg-surface/60 py-3 text-xs font-medium text-ink-secondary transition-colors duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-surface hover:text-ink-primary"
    >
      <IconPlus size={14} stroke={1.5} />
      <span>增补核心假设</span>
    </button>
  );
}

function HypothesesLensBody({ props }: { props: StepHypothesesProps }) {
  const d = useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step2`,
    serverValue: props.thesis.hypotheses,
    serverVersion: props.thesis.updatedAt,
    canSaveDraft: isValidHypotheses,
    onSyncChange: props.onSyncChange,
    validateStored: isHypothesisArray,
    onSave: props.onSave,
  });
  const addExtra = () =>
    d.setDraft((prev) => [...prev, buildExtraHypothesis(props.thesis.id, prev.length + 1)]);
  return (
    <>
      <div className="space-y-4">
        {d.draft.map((item, idx) => (
          <HypothesisEditorCard
            key={item.id}
            index={idx}
            total={d.draft.length}
            item={item}
            glossary={props.glossary}
            annuals={props.annuals}
            quarterlies={props.quarterlies}
            linkedChecks={props.thesis.crossChecks.filter((cc) => cc.hypothesisId === item.id)}
            onChange={(n) => d.setDraft((prev) => prev.map((it, i) => (i === idx ? n : it)))}
            onMove={(delta) => d.setDraft((prev) => swapHypotheses(prev, idx, delta))}
            onRemove={
              d.draft.length > 3
                ? () => d.setDraft((prev) => prev.filter((_, i) => i !== idx))
                : undefined
            }
          />
        ))}
      </div>
      <AddHypothesisButton visible={d.draft.length < 5} onAdd={addExtra} />
      <HypothesesRedTeamSlot
        loading={props.redTeamLoading}
        report={props.redTeam}
        onPromote={props.onPromoteRedTeamRule}
      />
    </>
  );
}

export function StepHypotheses(props: StepHypothesesProps) {
  const [lens, setLens] = useState<StepTwoLens>("hypotheses");

  return (
    <div className="space-y-6">
      <StepTwoHeader loading={props.redTeamLoading} onRun={props.onRunRedTeam} />
      <SegmentedTabs
        layoutId="step2-lens-tabs"
        value={lens}
        onChange={setLens}
        items={[
          { id: "hypotheses", label: "核心假设", count: props.thesis.hypotheses.length },
          { id: "catalysts", label: "催化剂日程", count: props.thesis.catalysts.length },
        ]}
      />
      <motion.div
        key={lens}
        variants={KANON_LENS_VARIANTS}
        initial="enter"
        animate="center"
        className="min-h-[360px] space-y-5"
      >
        {lens === "catalysts" ? (
          <CatalystLedgerSection
            thesisId={props.thesis.id}
            serverCatalysts={props.thesis.catalysts}
            serverVersion={props.thesis.updatedAt}
            onSyncChange={props.onSyncChange}
            onSave={props.onSaveCatalysts}
          />
        ) : (
          <HypothesesLensBody props={props} />
        )}
      </motion.div>
    </div>
  );
}
