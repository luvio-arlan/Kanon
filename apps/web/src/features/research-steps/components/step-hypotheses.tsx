"use client";

import type {
  GlossaryTerm,
  Hypothesis,
  RedTeamReport,
  ThesisCatalyst,
  ThesisDetail,
} from "@kanon/core";
import {
  AgentThinking,
  Button,
  ComposerLoader,
  KANON_LENS_VARIANTS,
  SegmentedTabs,
} from "@kanon/ui";
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

function HypothesesLensBody(p: {
  props: StepHypothesesProps;
  draft: Hypothesis[];
  setDraft: React.Dispatch<React.SetStateAction<Hypothesis[]>>;
  onAdd: () => void;
}) {
  const { props, draft, setDraft } = p;
  return (
    <>
      <div className="space-y-4">
        {draft.map((item, idx) => (
          <HypothesisEditorCard
            key={item.id}
            index={idx}
            total={draft.length}
            item={item}
            glossary={props.glossary}
            onChange={(n) => setDraft((prev) => prev.map((it, i) => (i === idx ? n : it)))}
            onMove={(delta) => setDraft((prev) => swapHypotheses(prev, idx, delta))}
            onRemove={
              draft.length > 3
                ? () => setDraft((prev) => prev.filter((_, i) => i !== idx))
                : undefined
            }
          />
        ))}
      </div>
      {draft.length < 5 ? (
        <button
          type="button"
          onClick={p.onAdd}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-panel border border-hairline bg-surface/60 py-3 text-xs font-medium text-ink-secondary transition-colors duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-surface hover:text-ink-primary"
        >
          <IconPlus size={14} stroke={1.5} />
          <span>增补核心假设</span>
        </button>
      ) : null}
      {props.redTeamLoading ? (
        <ComposerLoader active radius={14}>
          <div className="rounded-panel border border-hairline bg-surface px-5 py-4 shadow-card">
            <AgentThinking variant="stars" label="正在从空头视角审视核心假设盲区" />
          </div>
        </ComposerLoader>
      ) : null}
      {props.redTeam ? (
        <RedTeamResultCard report={props.redTeam} onPromoteRule={props.onPromoteRedTeamRule} />
      ) : null}
    </>
  );
}

function StepTwoStage(p: {
  lens: StepTwoLens;
  props: StepHypothesesProps;
  draft: Hypothesis[];
  setDraft: React.Dispatch<React.SetStateAction<Hypothesis[]>>;
  onAdd: () => void;
}) {
  return (
    <motion.div
      key={p.lens}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      className="min-h-[360px] space-y-5"
    >
      {p.lens === "catalysts" ? (
        <CatalystLedgerSection
          thesisId={p.props.thesis.id}
          serverCatalysts={p.props.thesis.catalysts}
          serverVersion={p.props.thesis.updatedAt}
          onSyncChange={p.props.onSyncChange}
          onSave={p.props.onSaveCatalysts}
        />
      ) : (
        <HypothesesLensBody props={p.props} draft={p.draft} setDraft={p.setDraft} onAdd={p.onAdd} />
      )}
    </motion.div>
  );
}

export function StepHypotheses(props: StepHypothesesProps) {
  const [lens, setLens] = useState<StepTwoLens>("hypotheses");
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
    <div className="space-y-6">
      <StepTwoHeader loading={props.redTeamLoading} onRun={props.onRunRedTeam} />
      <SegmentedTabs
        layoutId="step2-lens-tabs"
        value={lens}
        onChange={setLens}
        items={[
          { id: "hypotheses", label: "核心假设", count: d.draft.length },
          { id: "catalysts", label: "催化剂日程", count: props.thesis.catalysts.length },
        ]}
      />
      <StepTwoStage
        lens={lens}
        props={props}
        draft={d.draft}
        setDraft={d.setDraft}
        onAdd={addExtra}
      />
    </div>
  );
}
