"use client";

import type {
  CrossCheck,
  EarningsDigest,
  GlossaryTerm,
  InboundCrossCheck,
  ResearchNote,
  SecSnapshot,
  ThesisDetail,
  ThesisSummary,
} from "@kanon/core";
import { Card } from "@kanon/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AutoSaveStatus, useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { clearStoredDraft, readStoredDraft, writeStoredDraft } from "@/shared/lib/draft-storage";
import { buildClippedCrossCheck } from "../lib/cross-check-helpers";
import { AddCrossCheckForm, CrossCheckItemCard, nextAlignment } from "./cross-check-editor";
import { ManualFinancialsSheet } from "./filing/manual-financials-sheet";
import { ResearchNotesLibrary } from "./library/research-notes-library";
import { SecAnnualsTable } from "./sec-annuals-table";
import { EarningsDigestPanel, InboundCrossChecksPanel, SecFactsPanel } from "./sec-facts-panel";
import { SourceClipperSheet } from "./source-clipper-sheet";

export interface StepFirstPrinciplesProps {
  thesis: ThesisDetail;
  allTheses?: readonly ThesisSummary[];
  inboundCrossChecks?: readonly InboundCrossCheck[];
  glossary: readonly GlossaryTerm[];
  secSnapshot: SecSnapshot | null;
  secSyncing: boolean;
  researchNotes?: readonly ResearchNote[];
  digestLoading: boolean;
  digest: EarningsDigest | null;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSyncSec: () => Promise<void>;
  onSecSnapshotSaved?: (next: SecSnapshot) => void;
  onResearchNotesChange?: (next: ResearchNote[]) => void;
  onRunDigest: (sourceText?: string) => Promise<void>;
  onSaveCrossChecks: (items: CrossCheck[]) => Promise<boolean>;
  onPromoteExitRule?: (rule: string) => void;
}

function CrossCheckListSection(props: {
  checks: readonly CrossCheck[];
  linkableTheses: readonly ThesisSummary[];
  hypotheses: StepFirstPrinciplesProps["thesis"]["hypotheses"];
  glossary: readonly GlossaryTerm[];
  onCycle: (id: string) => void;
  onLinkHypothesis: (id: string, hypothesisId: string | null) => void;
  onDelete: (id: string) => void;
  onAdd: (next: CrossCheck) => void;
}) {
  return (
    <div className="space-y-4">
      {props.checks.length > 0 ? (
        <Card className="divide-y divide-hairline overflow-hidden">
          {props.checks.map((cc) => (
            <CrossCheckItemCard
              key={cc.id}
              cc={cc}
              glossary={props.glossary}
              hypotheses={props.hypotheses}
              onCycleAlignment={() => props.onCycle(cc.id)}
              onLinkHypothesis={(hypId) => props.onLinkHypothesis(cc.id, hypId)}
              onDelete={() => props.onDelete(cc.id)}
            />
          ))}
        </Card>
      ) : null}
      <AddCrossCheckForm
        linkableTheses={props.linkableTheses}
        hypotheses={props.hypotheses}
        onAdd={props.onAdd}
      />
    </div>
  );
}

function useTranscriptDraft(thesisId: string, fallbackNote: string) {
  const key = `kanon-transcript:${thesisId}`;
  const [transcript, setTranscript] = useState(
    () => readStoredDraft(key, "v1", (v): v is string => typeof v === "string") ?? fallbackNote,
  );
  useEffect(() => {
    if (transcript.trim()) writeStoredDraft(key, "v1", transcript);
    else clearStoredDraft(key);
  }, [transcript, key]);
  return [transcript, setTranscript] as const;
}

function StepThreeSheets(p: {
  props: StepFirstPrinciplesProps;
  s: ReturnType<typeof useStepThreeState>;
}) {
  const { props, s } = p;
  return (
    <>
      <SourceClipperSheet
        open={s.clipperOpen}
        ticker={props.thesis.ticker}
        filings={props.secSnapshot?.filings}
        sourceText={s.transcript}
        digest={props.digest}
        onChangeSource={s.setTranscript}
        onOpenChange={s.setClipperOpen}
        onClipCrossCheck={s.clip}
        onClipExitRule={props.onPromoteExitRule}
      />
      <ManualFinancialsSheet
        open={s.manualOpen}
        ticker={props.thesis.ticker}
        companyName={props.thesis.companyName}
        snapshot={props.secSnapshot}
        onOpenChange={s.setManualOpen}
        onSaved={(snap) => props.onSecSnapshotSaved?.(snap)}
      />
    </>
  );
}

function StepThreeEvidenceBody({
  props,
  s,
}: {
  props: StepFirstPrinciplesProps;
  s: ReturnType<typeof useStepThreeState>;
}) {
  return (
    <>
      <SecFactsPanel
        ticker={props.thesis.ticker}
        snapshot={props.secSnapshot}
        syncing={props.secSyncing}
        onSync={props.onSyncSec}
        onOpenManual={() => s.setManualOpen(true)}
      />
      {props.secSnapshot?.annuals.length ? (
        <SecAnnualsTable
          annuals={props.secSnapshot.annuals}
          quarterlies={props.secSnapshot.quarterlies}
          title="历史财务轨迹"
        />
      ) : null}
      <ResearchNotesLibrary
        thesisId={props.thesis.id}
        notes={s.notes}
        activeText={s.transcript}
        digestLoading={props.digestLoading}
        onNotesChange={(next) => props.onResearchNotesChange?.(next)}
        onActiveTextChange={s.setTranscript}
        onRunDigest={props.onRunDigest}
        onOpenClipper={() => s.setClipperOpen(true)}
      />
      {props.digest ? <EarningsDigestPanel digest={props.digest} /> : null}
      <InboundCrossChecksPanel items={props.inboundCrossChecks ?? []} />
    </>
  );
}

function useStepThreeState(props: StepFirstPrinciplesProps) {
  const notes = props.researchNotes ?? [];
  const d = useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step3`,
    serverValue: props.thesis.crossChecks,
    serverVersion: props.thesis.updatedAt,
    onSyncChange: props.onSyncChange,
    validateStored: (v): v is CrossCheck[] => Array.isArray(v),
    onSave: props.onSaveCrossChecks,
  });
  const [transcript, setTranscript] = useTranscriptDraft(props.thesis.id, notes[0]?.content ?? "");
  const [clipperOpen, setClipperOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const cycle = (id: string) =>
    d.setDraft((p) =>
      p.map((i) => (i.id === id ? { ...i, alignment: nextAlignment(i.alignment) } : i)),
    );
  const linkHyp = (id: string, hypothesisId: string | null) =>
    d.setDraft((p) => p.map((i) => (i.id === id ? { ...i, hypothesisId } : i)));
  const clip = (excerpt: string, anchor: string) => {
    d.setDraft((p) => [...p, buildClippedCrossCheck(props.thesis.companyName, excerpt, anchor)]);
    toast.success("已摘录至交叉验证");
  };
  return {
    notes,
    d,
    transcript,
    setTranscript,
    clipperOpen,
    setClipperOpen,
    manualOpen,
    setManualOpen,
    cycle,
    linkHyp,
    clip,
  };
}

export function StepFirstPrinciples(props: StepFirstPrinciplesProps) {
  const s = useStepThreeState(props);
  const linkable = (props.allTheses ?? []).filter((t) => t.id !== props.thesis.id);
  return (
    <div className="space-y-6">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
          一阶资料印证
        </h1>
      </header>
      <StepThreeEvidenceBody props={props} s={s} />
      <CrossCheckListSection
        checks={s.d.draft}
        linkableTheses={linkable}
        hypotheses={props.thesis.hypotheses}
        glossary={props.glossary}
        onCycle={s.cycle}
        onLinkHypothesis={s.linkHyp}
        onDelete={(id) => s.d.setDraft((p) => p.filter((i) => i.id !== id))}
        onAdd={(next) => s.d.setDraft((p) => [...p, next])}
      />
      <StepThreeSheets props={props} s={s} />
    </div>
  );
}
