"use client";

import type { EarningsDigest } from "@kanon/ai";
import type { CrossCheck, GlossaryTerm, SecSnapshot, ThesisDetail } from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconCheck, IconDeviceFloppy, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { AddCrossCheckForm, CrossCheckItemCard } from "./cross-check-editor";
import { SecFactsPanel } from "./sec-facts-panel";

export interface StepFirstPrinciplesProps {
  thesis: ThesisDetail;
  glossary: readonly GlossaryTerm[];
  secSnapshot: SecSnapshot | null;
  secSyncing: boolean;
  digestLoading: boolean;
  digest: EarningsDigest | null;
  saving: boolean;
  onSyncSec: () => Promise<void>;
  onRunDigest: () => Promise<void>;
  onSaveCrossChecks: (items: CrossCheck[]) => Promise<void>;
}

function EarningsDigestPanel({ digest }: { digest: EarningsDigest }) {
  return (
    <Card className="space-y-4 border-accent-coral/30 p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-primary">电话会核心提炼</h3>
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
    </Card>
  );
}

function StepThreeHeader({ loading, onRun }: { loading: boolean; onRun: () => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-primary">
          Step 3 · 一阶资料与产业链交叉验证
        </h2>
        <p className="mt-0.5 text-sm text-ink-secondary">
          不只听公司一面之词：用 SEC 10-K 与上下游伙伴口径互证真相
        </p>
      </div>
      <Button variant="titanium" size="md" disabled={loading} onClick={onRun}>
        <IconSparkles size={15} stroke={1.5} />
        <span>{loading ? "提炼中..." : "提炼电话会"}</span>
      </Button>
    </div>
  );
}

export function StepFirstPrinciples(props: StepFirstPrinciplesProps) {
  const [checks, setChecks] = useState<CrossCheck[]>(props.thesis.crossChecks);

  return (
    <div className="space-y-6">
      <StepThreeHeader loading={props.digestLoading} onRun={props.onRunDigest} />
      <SecFactsPanel
        ticker={props.thesis.ticker}
        snapshot={props.secSnapshot}
        syncing={props.secSyncing}
        onSync={props.onSyncSec}
      />
      {props.digest ? <EarningsDigestPanel digest={props.digest} /> : null}
      <div className="space-y-3">
        {checks.map((cc) => (
          <CrossCheckItemCard
            key={cc.id}
            cc={cc}
            glossary={props.glossary}
            onDelete={() => setChecks((prev) => prev.filter((item) => item.id !== cc.id))}
          />
        ))}
      </div>
      <AddCrossCheckForm onAdd={(next) => setChecks((prev) => [...prev, next])} />
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          disabled={props.saving}
          onClick={() => props.onSaveCrossChecks(checks)}
        >
          {props.saving ? (
            <IconCheck size={15} stroke={1.5} />
          ) : (
            <IconDeviceFloppy size={15} stroke={1.5} />
          )}
          <span>{props.saving ? "保存中..." : "保存交叉验证记录"}</span>
        </Button>
      </div>
    </div>
  );
}
