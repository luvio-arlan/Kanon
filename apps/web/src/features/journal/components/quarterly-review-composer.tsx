"use client";

import type { CreateQuarterlyReviewInput, HypothesisVerdictItem, ThesisDetail } from "@kanon/core";
import { Button, Card, cn, DisciplineSwitch, Input, Textarea } from "@kanon/ui";
import { IconCheck } from "@tabler/icons-react";
import { useState } from "react";

type Verdict = HypothesisVerdictItem["verdict"];

export const VERDICT_META: Record<
  Verdict,
  { label: string; badge: "pass" | "default" | "warn"; activeClass: string }
> = {
  strengthened: {
    label: "强化",
    badge: "pass",
    activeClass: "border-status-pass/40 bg-status-pass-soft text-status-pass font-medium",
  },
  unchanged: {
    label: "持平",
    badge: "default",
    activeClass: "border-strong bg-titanium text-ink-primary font-medium",
  },
  weakened: {
    label: "削弱",
    badge: "warn",
    activeClass: "border-status-warn/40 bg-status-warn-soft text-status-warn font-medium",
  },
};

function defaultQuarterLabel(): string {
  const now = new Date();
  return `FY${String(now.getFullYear()).slice(-2)} Q${Math.floor(now.getMonth() / 3) + 1}`;
}

function buildInitialVerdicts(thesis: ThesisDetail): HypothesisVerdictItem[] {
  return thesis.hypotheses.map((h) => ({
    hypothesisId: h.id,
    title: h.title,
    verdict: "unchanged",
    evidence: h.note.trim() || `待补充本季针对「${h.title}」的财报核验`,
  }));
}

function VerdictRow({
  item,
  index,
  onChange,
}: {
  item: HypothesisVerdictItem;
  index: number;
  onChange: (next: HypothesisVerdictItem) => void;
}) {
  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-ink-primary">
          <span className="mr-1.5 font-mono text-ink-muted">0{index + 1}</span>
          {item.title}
        </span>
        <div className="flex items-center gap-1.5">
          {(["strengthened", "unchanged", "weakened"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ ...item, verdict: v })}
              className={cn(
                "cursor-pointer rounded-pill border px-2.5 py-1 text-xs transition-colors",
                item.verdict === v
                  ? VERDICT_META[v].activeClass
                  : "border-hairline bg-surface text-ink-secondary hover:border-strong",
              )}
            >
              {VERDICT_META[v].label}
            </button>
          ))}
        </div>
      </div>
      <Input
        value={item.evidence}
        onChange={(e) => onChange({ ...item, evidence: e.target.value })}
        placeholder="填写本季度支持该判断的财报数据或管理层原话..."
      />
    </div>
  );
}

interface ComposerHeaderFieldsProps {
  quarterLabel: string;
  applyUpdates: boolean;
  summary: string;
  onQuarter: (v: string) => void;
  onApplyUpdates: (v: boolean) => void;
  onSummary: (v: string) => void;
}

function ComposerHeaderFields(p: ComposerHeaderFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[200px_1fr] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="qrev-quarter" className="text-xs text-ink-muted">
            财报季度标签
          </label>
          <Input
            id="qrev-quarter"
            value={p.quarterLabel}
            onChange={(e) => p.onQuarter(e.target.value)}
            placeholder="例如 FY26 Q4"
          />
        </div>
        <DisciplineSwitch
          isSelected={p.applyUpdates}
          onChange={p.onApplyUpdates}
          label="同步更新核心假设状态"
        />
      </div>
      <div className="rounded-panel border border-hairline bg-canvas/35 px-4 py-3.5 transition-colors focus-within:bg-surface">
        <label htmlFor="qrev-summary" className="mb-1.5 block text-xs font-medium text-ink-muted">
          季度复盘核心结论
        </label>
        <Textarea
          id="qrev-summary"
          variant="editorial"
          value={p.summary}
          onChange={(e) => p.onSummary(e.target.value)}
          placeholder="总结本季核心财报亮点与预期差兑现情况…"
          className="min-h-[76px]"
        />
      </div>
    </>
  );
}

function ComposerVerdictList({
  verdicts,
  onChangeAt,
}: {
  verdicts: readonly HypothesisVerdictItem[];
  onChangeAt: (idx: number, next: HypothesisVerdictItem) => void;
}) {
  return (
    <div className="space-y-2 border-t border-hairline pt-4">
      <div className="text-xs font-medium text-ink-secondary">逐条复核核心假设</div>
      <div className="divide-y divide-hairline">
        {verdicts.map((item, idx) => (
          <VerdictRow
            key={item.hypothesisId}
            item={item}
            index={idx}
            onChange={(next) => onChangeAt(idx, next)}
          />
        ))}
      </div>
    </div>
  );
}

interface QuarterlyReviewComposerProps {
  thesis: ThesisDetail;
  submitting: boolean;
  canCollapse: boolean;
  onClose: () => void;
  onSubmit: (input: CreateQuarterlyReviewInput) => Promise<void>;
}

function ComposerActionBar({
  canCollapse,
  valid,
  submitting,
  onClose,
  onSubmit,
}: {
  canCollapse: boolean;
  valid: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-hairline pt-4">
      {canCollapse ? (
        <Button variant="ghost" size="sm" onClick={onClose}>
          取消
        </Button>
      ) : null}
      <Button variant="primary" size="md" disabled={!valid || submitting} onClick={onSubmit}>
        <IconCheck size={14} stroke={1.5} />
        <span>{submitting ? "归档中..." : "归档本季复盘"}</span>
      </Button>
    </div>
  );
}

export function QuarterlyReviewComposer(props: QuarterlyReviewComposerProps) {
  const [quarterLabel, setQuarterLabel] = useState(defaultQuarterLabel);
  const [summary, setSummary] = useState("");
  const [applyUpdates, setApplyUpdates] = useState(true);
  const [verdicts, setVerdicts] = useState<HypothesisVerdictItem[]>(() =>
    buildInitialVerdicts(props.thesis),
  );
  const valid =
    quarterLabel.trim().length >= 2 &&
    summary.trim().length >= 6 &&
    verdicts.every((v) => v.evidence.trim().length > 0);

  async function handleSubmit() {
    if (!valid || props.submitting) return;
    await props.onSubmit({
      quarterLabel: quarterLabel.trim(),
      summary: summary.trim(),
      hypothesisVerdicts: verdicts.map((v) => ({ ...v, evidence: v.evidence.trim() })),
      applyStatusUpdates: applyUpdates,
    });
    setSummary("");
    props.onClose();
  }

  return (
    <Card className="space-y-5 p-6">
      <ComposerHeaderFields
        quarterLabel={quarterLabel}
        applyUpdates={applyUpdates}
        summary={summary}
        onQuarter={setQuarterLabel}
        onApplyUpdates={setApplyUpdates}
        onSummary={setSummary}
      />
      <ComposerVerdictList
        verdicts={verdicts}
        onChangeAt={(idx, next) =>
          setVerdicts((prev) => prev.map((v, i) => (i === idx ? next : v)))
        }
      />
      <ComposerActionBar
        canCollapse={props.canCollapse}
        valid={valid}
        submitting={props.submitting}
        onClose={props.onClose}
        onSubmit={() => void handleSubmit()}
      />
    </Card>
  );
}
