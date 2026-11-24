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
import { Button, Card, Textarea } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconScissors, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
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
  saving: boolean;
  onDirtyChange?: (dirty: boolean, saveAction: (() => Promise<void>) | null) => void;
  onSyncSec: () => Promise<void>;
  onRunDigest: (sourceText?: string) => Promise<void>;
  onSaveCrossChecks: (items: CrossCheck[]) => Promise<void>;
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
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-primary">
            电话会纪要 / 10-K 原文精读提炼
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            粘贴 Earnings Call 原文后，可用 AI 提炼或打开精读器划词摘录至互证与离场红线
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenClipper}>
            <IconScissors size={14} stroke={1.5} />
            <span>精读与划词摘录</span>
          </Button>
          <Button variant="titanium" size="sm" disabled={loading} onClick={onRun}>
            <IconSparkles size={14} stroke={1.5} />
            <span>{loading ? "提炼中..." : "提炼电话会"}</span>
          </Button>
        </div>
      </div>
      <Textarea
        value={sourceText}
        onChange={(e) => onChange(e.target.value)}
        placeholder="可选：粘贴季度电话会管理层问答、CapEx 指引或 10-K 风险段落..."
        className="min-h-[80px]"
      />
    </Card>
  );
}

function CrossCheckListSection(props: {
  checks: readonly CrossCheck[];
  linkableTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  saving: boolean;
  onCycle: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (next: CrossCheck) => void;
  onSave: () => Promise<void>;
}) {
  return (
    <>
      <div className="space-y-3">
        {props.checks.map((cc) => (
          <CrossCheckItemCard
            key={cc.id}
            cc={cc}
            glossary={props.glossary}
            onCycleAlignment={() => props.onCycle(cc.id)}
            onDelete={() => props.onDelete(cc.id)}
          />
        ))}
      </div>
      <AddCrossCheckForm linkableTheses={props.linkableTheses} onAdd={props.onAdd} />
      <div className="flex justify-end">
        <Button variant="primary" size="md" disabled={props.saving} onClick={props.onSave}>
          {props.saving ? (
            <IconCheck size={15} stroke={1.5} />
          ) : (
            <IconDeviceFloppy size={15} stroke={1.5} />
          )}
          <span>{props.saving ? "保存中..." : "保存交叉验证记录"}</span>
        </Button>
      </div>
    </>
  );
}

function isCrossCheckArray(val: unknown): val is CrossCheck[] {
  return Array.isArray(val);
}

function StepThreeHeading() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-ink-primary">Step 3 · 一阶资料与产业链交叉验证</h2>
      <p className="mt-0.5 text-sm text-ink-secondary">
        不只听公司一面之词：用 SEC 多年度财务轨迹、电话会原话与上下游伙伴口径互证真相
      </p>
    </div>
  );
}

function useStepThreeDraft(props: StepFirstPrinciplesProps) {
  return useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step3`,
    serverValue: props.thesis.crossChecks,
    serverVersion: props.thesis.updatedAt,
    canSave: !props.saving,
    onDirtyChange: props.onDirtyChange,
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

export function StepFirstPrinciples(props: StepFirstPrinciplesProps) {
  const d = useStepThreeDraft(props);
  const [transcript, setTranscript] = useState("");
  const [clipperOpen, setClipperOpen] = useState(false);
  const linkable = (props.allTheses ?? []).filter((t) => t.id !== props.thesis.id);
  const cycleCheck = (id: string) =>
    d.setDraft((p) =>
      p.map((i) => (i.id === id ? { ...i, alignment: nextAlignment(i.alignment) } : i)),
    );
  const clipCrossCheck = (excerpt: string, anchor: string) => {
    d.setDraft((p) => [...p, buildClippedCrossCheck(props.thesis.companyName, excerpt, anchor)]);
    toast.success("已摘录至 Step 3 交叉验证草稿，记得点击保存");
  };

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d} saving={props.saving} />
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
        saving={props.saving}
        onCycle={cycleCheck}
        onDelete={(id) => d.setDraft((p) => p.filter((i) => i.id !== id))}
        onAdd={(next) => d.setDraft((p) => [...p, next])}
        onSave={d.save}
      />
      <SourceClipperSheet
        open={clipperOpen}
        ticker={props.thesis.ticker}
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
