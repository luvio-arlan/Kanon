"use client";

import type {
  CrossCheck,
  EarningsDigest,
  GlossaryTerm,
  SecSnapshot,
  ThesisDetail,
} from "@kanon/core";
import { Badge, Button, Card, Textarea } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { DraftStatusBar } from "@/shared/components/draft-status-bar";
import { useThesisStepDraft } from "@/shared/hooks/use-thesis-step-draft";
import { AddCrossCheckForm, CrossCheckItemCard, nextAlignment } from "./cross-check-editor";
import { SecAnnualsTable } from "./sec-annuals-table";
import { SecFactsPanel } from "./sec-facts-panel";

export interface StepFirstPrinciplesProps {
  thesis: ThesisDetail;
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
}

function EarningsDigestPanel({ digest }: { digest: EarningsDigest }) {
  return (
    <Card className="space-y-4 border-accent-coral/30 p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">电话会核心提炼（已持久化）</h3>
        <Badge variant="coral">{digest.quarterLabel}</Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-primary">{digest.guidanceSummary}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-control bg-muted/60 p-4">
          <div className="text-xs font-semibold text-ink-primary">资本开支与供给信号</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-secondary">
            {digest.capexSignals.map((sig) => (
              <li key={sig}>{sig}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-control bg-muted/60 p-4">
          <div className="text-xs font-semibold text-ink-primary">管理层措辞与关注点</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-secondary">
            {digest.toneShifts.map((shift) => (
              <li key={shift}>{shift}</li>
            ))}
          </ul>
        </div>
      </div>
      {digest.quotesWithAnchors.length > 0 ? (
        <div className="space-y-2 border-t border-hairline pt-4">
          <div className="text-xs font-semibold text-ink-muted">一阶原文锚点摘录</div>
          {digest.quotesWithAnchors.map((q) => (
            <div
              key={`${q.topic}-${q.sourceAnchor}`}
              className="border-l-2 border-accent-coral/60 pl-3.5 py-0.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-medium text-ink-primary">{q.topic}</span>
                <span className="font-mono text-ink-muted">{q.sourceAnchor}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{q.summary}</p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function TranscriptInputCard({
  sourceText,
  loading,
  onChange,
  onRun,
}: {
  sourceText: string;
  loading: boolean;
  onChange: (next: string) => void;
  onRun: () => Promise<void>;
}) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-ink-primary">
            电话会纪要 / 10-K 原文精读提炼
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            可粘贴最新 Earnings Call 原文片段或直接基于当前档案提炼指引与 CapEx 信号
          </div>
        </div>
        <Button variant="titanium" size="sm" disabled={loading} onClick={onRun}>
          <IconSparkles size={14} stroke={1.5} />
          <span>{loading ? "提炼中..." : "提炼电话会"}</span>
        </Button>
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
      <AddCrossCheckForm onAdd={props.onAdd} />
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

export function StepFirstPrinciples(props: StepFirstPrinciplesProps) {
  const d = useThesisStepDraft({
    storageKey: `kanon-draft:${props.thesis.id}:step3`,
    serverValue: props.thesis.crossChecks,
    serverVersion: props.thesis.updatedAt,
    canSave: !props.saving,
    onDirtyChange: props.onDirtyChange,
    validateStored: isCrossCheckArray,
    onSave: props.onSaveCrossChecks,
  });
  const [transcript, setTranscript] = useState("");
  const cycleCheck = (id: string) =>
    d.setDraft((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, alignment: nextAlignment(item.alignment) } : item,
      ),
    );

  return (
    <div className="space-y-6">
      <DraftStatusBar draft={d} saving={props.saving} />
      <StepThreeHeading />
      <SecFactsPanel
        ticker={props.thesis.ticker}
        snapshot={props.secSnapshot}
        syncing={props.secSyncing}
        onSync={props.onSyncSec}
      />
      {props.secSnapshot?.annuals.length ? (
        <SecAnnualsTable annuals={props.secSnapshot.annuals} />
      ) : null}
      <TranscriptInputCard
        sourceText={transcript}
        loading={props.digestLoading}
        onChange={setTranscript}
        onRun={() => props.onRunDigest(transcript)}
      />
      {props.digest ? <EarningsDigestPanel digest={props.digest} /> : null}
      <CrossCheckListSection
        checks={d.draft}
        glossary={props.glossary}
        saving={props.saving}
        onCycle={cycleCheck}
        onDelete={(id) => d.setDraft((prev) => prev.filter((item) => item.id !== id))}
        onAdd={(next) => d.setDraft((prev) => [...prev, next])}
        onSave={d.save}
      />
    </div>
  );
}
