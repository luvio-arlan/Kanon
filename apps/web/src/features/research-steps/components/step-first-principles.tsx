"use client";

import type {
  CrossCheck,
  EarningsDigest,
  GlossaryTerm,
  InboundCrossCheck,
  SecSnapshot,
  ThesisDetail,
  ThesisSummary,
} from "@kanon/core";
import { AgentThinking, Button, Card, Textarea } from "@kanon/ui";
import { IconScissors, IconSparkles } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type AutoSaveStatus, useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { clearStoredDraft, readStoredDraft, writeStoredDraft } from "@/shared/lib/draft-storage";
import { buildClippedCrossCheck } from "../lib/cross-check-helpers";
import { AddCrossCheckForm, CrossCheckItemCard, nextAlignment } from "./cross-check-editor";
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
  digestLoading: boolean;
  digest: EarningsDigest | null;
  onSyncChange?: (status: AutoSaveStatus, flush: (() => Promise<void>) | null) => void;
  onSyncSec: () => Promise<void>;
  onRunDigest: (sourceText?: string) => Promise<void>;
  onSaveCrossChecks: (items: CrossCheck[]) => Promise<boolean>;
  onPromoteExitRule?: (rule: string) => void;
}

function TranscriptInputCard({
  sourceText,
  loading,
  onChange,
  onRun,
  onOpenClipper,
}: {
  sourceText: string;
  loading: boolean;
  onChange: (next: string) => void;
  onRun: () => Promise<void>;
  onOpenClipper: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-6 py-4 sm:px-7">
        <h3 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-primary">
          电话会纪要与原文精读
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="xs" onClick={onOpenClipper}>
            <IconScissors size={14} stroke={1.5} />
            <span>原文摘录</span>
          </Button>
          <Button variant="titanium" size="xs" loading={loading} onClick={onRun}>
            {!loading ? <IconSparkles size={14} stroke={1.5} /> : null}
            <span>{loading ? "提炼中" : "AI 提炼"}</span>
          </Button>
        </div>
      </div>
      <div className="space-y-3 px-6 py-5 transition-colors focus-within:bg-canvas/45 sm:px-7">
        {loading ? <AgentThinking variant="wave" label="正在提炼核心要点" /> : null}
        <Textarea
          variant="editorial"
          value={sourceText}
          onChange={(e) => onChange(e.target.value)}
          placeholder="粘贴季度电话会问答、CapEx 指引或 10-K 关键段落…"
          className="min-h-[104px]"
        />
      </div>
    </Card>
  );
}

function CrossCheckListSection(props: {
  checks: readonly CrossCheck[];
  linkableTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  onCycle: (id: string) => void;
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
              onCycleAlignment={() => props.onCycle(cc.id)}
              onDelete={() => props.onDelete(cc.id)}
            />
          ))}
        </Card>
      ) : null}
      <AddCrossCheckForm linkableTheses={props.linkableTheses} onAdd={props.onAdd} />
    </div>
  );
}

function isCrossCheckArray(val: unknown): val is CrossCheck[] {
  return Array.isArray(val);
}

function StepThreeHeading() {
  return (
    <header className="border-b border-hairline pb-4">
      <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink-primary">
        一阶资料印证
      </h1>
    </header>
  );
}

function useStepThreeDraft(props: StepFirstPrinciplesProps) {
  return useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step3`,
    serverValue: props.thesis.crossChecks,
    serverVersion: props.thesis.updatedAt,
    onSyncChange: props.onSyncChange,
    validateStored: isCrossCheckArray,
    onSave: props.onSaveCrossChecks,
  });
}

function StepThreeEvidenceBody({
  props,
  transcript,
  onTranscript,
  onOpenClipper,
}: {
  props: StepFirstPrinciplesProps;
  transcript: string;
  onTranscript: (v: string) => void;
  onOpenClipper: () => void;
}) {
  return (
    <>
      <SecFactsPanel
        ticker={props.thesis.ticker}
        snapshot={props.secSnapshot}
        syncing={props.secSyncing}
        onSync={props.onSyncSec}
      />
      {props.secSnapshot?.annuals.length ? (
        <SecAnnualsTable
          annuals={props.secSnapshot.annuals}
          quarterlies={props.secSnapshot.quarterlies}
          title="历史财务轨迹"
        />
      ) : null}
      <TranscriptInputCard
        sourceText={transcript}
        loading={props.digestLoading}
        onChange={onTranscript}
        onRun={() => props.onRunDigest(transcript)}
        onOpenClipper={onOpenClipper}
      />
      {props.digest ? <EarningsDigestPanel digest={props.digest} /> : null}
      <InboundCrossChecksPanel items={props.inboundCrossChecks ?? []} />
    </>
  );
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string";
}

function useTranscriptDraft(thesisId: string) {
  const transcriptKey = `kanon-transcript:${thesisId}`;
  const [transcript, setTranscript] = useState(
    () => readStoredDraft(transcriptKey, "v1", isNonEmptyString) ?? "",
  );
  useEffect(() => {
    if (transcript.trim()) writeStoredDraft(transcriptKey, "v1", transcript);
    else clearStoredDraft(transcriptKey);
  }, [transcript, transcriptKey]);
  return [transcript, setTranscript] as const;
}

export function StepFirstPrinciples(props: StepFirstPrinciplesProps) {
  const d = useStepThreeDraft(props);
  const [transcript, setTranscript] = useTranscriptDraft(props.thesis.id);
  const [clipperOpen, setClipperOpen] = useState(false);
  const linkable = (props.allTheses ?? []).filter((t) => t.id !== props.thesis.id);
  const cycleCheck = (id: string) =>
    d.setDraft((p) =>
      p.map((i) => (i.id === id ? { ...i, alignment: nextAlignment(i.alignment) } : i)),
    );
  const clipCrossCheck = (excerpt: string, anchor: string) => {
    d.setDraft((p) => [...p, buildClippedCrossCheck(props.thesis.companyName, excerpt, anchor)]);
    toast.success("已摘录至交叉验证");
  };

  return (
    <div className="space-y-6">
      <StepThreeHeading />
      <StepThreeEvidenceBody
        props={props}
        transcript={transcript}
        onTranscript={setTranscript}
        onOpenClipper={() => setClipperOpen(true)}
      />
      <CrossCheckListSection
        checks={d.draft}
        linkableTheses={linkable}
        glossary={props.glossary}
        onCycle={cycleCheck}
        onDelete={(id) => d.setDraft((p) => p.filter((i) => i.id !== id))}
        onAdd={(next) => d.setDraft((p) => [...p, next])}
      />
      <SourceClipperSheet
        open={clipperOpen}
        ticker={props.thesis.ticker}
        filings={props.secSnapshot?.filings}
        sourceText={transcript}
        digest={props.digest}
        onChangeSource={setTranscript}
        onOpenChange={setClipperOpen}
        onClipCrossCheck={clipCrossCheck}
        onClipExitRule={props.onPromoteExitRule}
      />
    </div>
  );
}
