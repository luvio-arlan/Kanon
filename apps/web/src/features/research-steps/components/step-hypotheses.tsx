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
  ProgressBar,
  SegmentedTabs,
} from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconFlame, IconPlus } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { buildExtraHypothesis, isHypothesisArray, swapHypotheses } from "../lib/hypothesis-helpers";
import { CatalystLedgerSection } from "./catalysts/catalyst-ledger-section";
import { HypothesisEditorCard } from "./hypothesis-editor-card";
import { RedTeamResultCard } from "./red-team-result-card";

type StepTwoLens = "hypotheses" | "catalysts";

export interface StepHypothesesProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  saving: boolean;
  redTeamLoading: boolean;
  redTeam: RedTeamReport | null;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSave: (hypotheses: Hypothesis[]) => Promise<void>;
  onSaveCatalysts: (catalysts: ThesisCatalyst[]) => Promise<void>;
  onRunRedTeam: () => Promise<void>;
  onPromoteRedTeamRule?: (rule: string) => void;
}

function StepTwoHeader({
  count,
  loading,
  onRun,
}: {
  count: number;
  loading: boolean;
  onRun: () => Promise<void>;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="h-[1.5px] w-7 bg-accent-coral" />
          <span className="font-mono text-xs tracking-[0.12em] text-ink-muted">
            STEP 02 · {count} ITEMS
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink-primary">
            核心假设与催化剂
          </h1>
          <span className="kanon-serif-italic text-2xl">Hypotheses & Catalysts</span>
        </div>
      </div>
      <Button variant="coral" size="md" loading={loading} onClick={onRun}>
        {!loading ? <IconFlame size={16} stroke={1.5} /> : null}
        <span>{loading ? "推演中" : "红队挑刺"}</span>
      </Button>
    </header>
  );
}

function StepTwoFooter(p: {
  count: number;
  saving: boolean;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      {p.count < 5 ? (
        <Button variant="outline" size="md" onClick={p.onAdd}>
          <IconPlus size={15} stroke={1.5} />
          <span>增补第 {p.count + 1} 条假设</span>
        </Button>
      ) : (
        <span className="font-mono text-xs text-ink-muted">5 / 5 核心假设</span>
      )}
      <Button variant="primary" size="lg" disabled={p.saving} onClick={p.onSave}>
        {p.saving ? (
          <IconCheck size={16} stroke={1.5} />
        ) : (
          <IconDeviceFloppy size={16} stroke={1.5} />
        )}
        <span>{p.saving ? "保存中..." : `保存 ${p.count} 条核心假设`}</span>
      </Button>
    </div>
  );
}

function HypothesesLensBody(p: {
  props: StepHypothesesProps;
  draft: Hypothesis[];
  setDraft: React.Dispatch<React.SetStateAction<Hypothesis[]>>;
  onAdd: () => void;
  onSave: () => void;
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
      {props.redTeamLoading ? (
        <ComposerLoader active radius={18}>
          <div className="space-y-2.5 rounded-card border border-hairline bg-surface p-4 shadow-card">
            <AgentThinking variant="stars" label="红队空头正在反演核心假设盲区" />
            <ProgressBar indeterminate tone="accent" size="sm" />
          </div>
        </ComposerLoader>
      ) : null}
      {props.redTeam ? (
        <RedTeamResultCard report={props.redTeam} onPromoteRule={props.onPromoteRedTeamRule} />
      ) : null}
      <StepTwoFooter count={draft.length} saving={props.saving} onAdd={p.onAdd} onSave={p.onSave} />
    </>
  );
}

function StepTwoStage(p: {
  lens: StepTwoLens;
  props: StepHypothesesProps;
  draft: Hypothesis[];
  setDraft: React.Dispatch<React.SetStateAction<Hypothesis[]>>;
  onAdd: () => void;
  onSave: () => void;
}) {
  return (
    <motion.div
      key={p.lens}
      variants={KANON_LENS_VARIANTS}
      initial="enter"
      animate="center"
      className="min-h-[360px] space-y-6"
    >
      {p.lens === "catalysts" ? (
        <CatalystLedgerSection
          thesisId={p.props.thesis.id}
          serverCatalysts={p.props.thesis.catalysts}
          saving={p.props.saving}
          onSave={p.props.onSaveCatalysts}
        />
      ) : (
        <HypothesesLensBody
          props={p.props}
          draft={p.draft}
          setDraft={p.setDraft}
          onAdd={p.onAdd}
          onSave={p.onSave}
        />
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
    canSave: !props.saving,
    onDirtyChange: props.onDirtyChange,
    validateStored: isHypothesisArray,
    onSave: props.onSave,
  });
  const addExtra = () =>
    d.setDraft((prev) => [...prev, buildExtraHypothesis(props.thesis.id, prev.length + 1)]);

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d} saving={props.saving} />
      <StepTwoHeader
        count={d.draft.length}
        loading={props.redTeamLoading}
        onRun={props.onRunRedTeam}
      />
      <SegmentedTabs
        layoutId="step2-lens-tabs"
        value={lens}
        onChange={setLens}
        items={[
          { id: "hypotheses", label: "核心可证伪假设", count: d.draft.length },
          { id: "catalysts", label: "催化剂与重估日程", count: props.thesis.catalysts.length },
        ]}
      />
      <StepTwoStage
        lens={lens}
        props={props}
        draft={d.draft}
        setDraft={d.setDraft}
        onAdd={addExtra}
        onSave={() => void d.save()}
      />
    </div>
  );
}
