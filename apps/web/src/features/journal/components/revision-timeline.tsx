"use client";

import type { RevisionSnapshot, RevisionStep, ThesisRevision } from "@kanon/core";
import { ActionMenu, Badge, Button, Card } from "@kanon/ui";
import { IconArrowRight, IconChevronDown, IconGitCompare, IconHistory } from "@tabler/icons-react";
import { useState } from "react";

const STEP_LABELS: Record<RevisionStep, string> = {
  create: "建档立项",
  business_filter: "商业模式",
  hypotheses: "核心假设",
  cross_checks: "交叉验证",
  valuation: "三情景估值",
  price_anchor: "现价校准",
  discipline: "交易纪律",
  portfolio: "组合仓位",
  quarterly_review: "季度复盘",
};

const HYP_STATUS_LABEL = {
  validated: "已验证",
  watching: "跟踪中",
  warning: "预警",
} as const;

function formatDeltaPct(before: number, after: number): string {
  if (before === 0) return "—";
  const pct = ((after - before) / before) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function DiffMetricCell({
  label,
  before,
  after,
  delta,
}: {
  label: string;
  before: string;
  after: string;
  delta?: string;
}) {
  return (
    <div className="rounded-control border border-hairline bg-surface px-3.5 py-2.5">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-xs tabular-nums">
        <span className="text-ink-muted">{before}</span>
        <IconArrowRight size={12} stroke={1.5} className="text-ink-muted" />
        <span className="font-semibold text-ink-primary">{after}</span>
        {delta ? <span className="ml-auto text-ink-secondary">{delta}</span> : null}
      </div>
    </div>
  );
}

function HypothesisDiffList({
  older,
  newer,
}: {
  older: RevisionSnapshot;
  newer: RevisionSnapshot;
}) {
  const changes = newer.hypotheses.map((curr, idx) => {
    const prev = older.hypotheses.find((h) => h.title === curr.title) ?? older.hypotheses[idx];
    const changed = !prev || prev.status !== curr.status;
    return {
      title: curr.title,
      prevStatus: prev?.status ?? null,
      nextStatus: curr.status,
      changed,
    };
  });

  return (
    <div className="space-y-1.5 pt-1">
      <div className="text-xs font-medium text-ink-secondary">核心假设状态演变</div>
      <div className="space-y-1">
        {changes.map((c) => (
          <div
            key={c.title}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface px-3 py-1.5 text-xs"
          >
            <span className="text-ink-primary">{c.title}</span>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <span className="text-ink-muted">
                {c.prevStatus ? HYP_STATUS_LABEL[c.prevStatus] : "新增"}
              </span>
              <IconArrowRight size={12} stroke={1.5} className="text-ink-muted" />
              <Badge variant={c.changed ? "coral" : "default"}>
                {HYP_STATUS_LABEL[c.nextStatus]}
              </Badge>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffMetricGrid({ older, latest }: { older: RevisionSnapshot; latest: RevisionSnapshot }) {
  const fmtRatio = (r: number | null) => (r !== null ? `${r.toFixed(2)}×` : "∞");
  const readinessDiff = latest.readinessScore - older.readinessScore;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <DiffMetricCell
        label="参考现价"
        before={`$${older.currentPrice.toFixed(1)}`}
        after={`$${latest.currentPrice.toFixed(1)}`}
        delta={formatDeltaPct(older.currentPrice, latest.currentPrice)}
      />
      <DiffMetricCell
        label="中性目标价"
        before={`$${older.baseTarget.toFixed(1)}`}
        after={`$${latest.baseTarget.toFixed(1)}`}
        delta={formatDeltaPct(older.baseTarget, latest.baseTarget)}
      />
      <DiffMetricCell
        label="风险回报赔率"
        before={fmtRatio(older.riskRewardRatio)}
        after={fmtRatio(latest.riskRewardRatio)}
      />
      <DiffMetricCell
        label="研究成熟度"
        before={`${older.readinessScore}%`}
        after={`${latest.readinessScore}%`}
        delta={`${readinessDiff >= 0 ? "+" : ""}${readinessDiff}pt`}
      />
    </div>
  );
}

function CognitiveDiffPanel({
  snapshots,
}: {
  snapshots: readonly (ThesisRevision & { snapshot: RevisionSnapshot })[];
}) {
  const latest = snapshots[0];
  const baselineOptions = snapshots.slice(1);
  const [baseId, setBaseId] = useState(baselineOptions[0]?.id ?? "");
  const older = baselineOptions.find((r) => r.id === baseId) ?? baselineOptions[0];
  if (!latest || !older) return null;

  const menuItems = baselineOptions.map((r) => ({
    id: r.id,
    label: `${r.createdAt.slice(5, 16).replace("T", " ")} · ${STEP_LABELS[r.step]}`,
    onSelect: () => setBaseId(r.id),
  }));

  return (
    <div className="mb-4 space-y-3 rounded-control border border-hairline bg-muted/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink-primary">认知演进快照对比</span>
        <div className="flex items-center gap-2">
          <span className="text-ink-muted">基准版本：</span>
          <ActionMenu
            ariaLabel="选择对比基准版本"
            placement="bottom end"
            items={menuItems}
            trigger={
              <>
                <span className="font-mono">
                  {older.createdAt.slice(5, 16).replace("T", " ")} · {STEP_LABELS[older.step]}
                </span>
                <IconChevronDown size={13} stroke={1.5} />
              </>
            }
          />
          <span className="text-ink-muted">vs 最新</span>
        </div>
      </div>
      <DiffMetricGrid older={older.snapshot} latest={latest.snapshot} />
      <HypothesisDiffList older={older.snapshot} newer={latest.snapshot} />
    </div>
  );
}

function RevisionRow({ item }: { item: ThesisRevision }) {
  const ratio = item.riskRewardRatio !== null ? `${item.riskRewardRatio.toFixed(2)}×` : "∞";
  return (
    <article className="py-4 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="titanium">{STEP_LABELS[item.step]}</Badge>
          <span className="font-mono text-ink-secondary tabular-nums">
            现价 ${item.currentPrice.toFixed(2)} → 目标 ${item.baseTargetPrice.toFixed(1)}
          </span>
          <span aria-hidden="true" className="text-ink-muted">
            ·
          </span>
          <span className="font-mono font-medium text-ink-primary tabular-nums">赔率 {ratio}</span>
        </div>
        <time className="font-mono text-ink-muted tabular-nums">
          {item.createdAt.slice(0, 16).replace("T", " ")}
        </time>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-primary">{item.summary}</p>
    </article>
  );
}

export function RevisionTimeline({ revisions }: { revisions: readonly ThesisRevision[] }) {
  const [diffOpen, setDiffOpen] = useState(false);
  const withSnapshots = revisions.filter(
    (r): r is ThesisRevision & { snapshot: RevisionSnapshot } => Boolean(r.snapshot),
  );

  if (revisions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-secondary">
          暂无演进快照。每次保存研究步骤、校准现价或签署纪律卡，都会自动沉淀不可篡改的版本轨迹。
        </p>
      </Card>
    );
  }

  return (
    <Card className="px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
          <IconHistory size={14} stroke={1.5} />
          <span>跨季度研究演进日志</span>
        </span>
        <div className="flex items-center gap-3">
          {withSnapshots.length >= 2 ? (
            <Button variant="outline" size="sm" onClick={() => setDiffOpen((v) => !v)}>
              <IconGitCompare size={13} stroke={1.5} />
              <span>{diffOpen ? "收起演进 Diff" : "对比认知演进 Diff"}</span>
            </Button>
          ) : null}
          <span className="font-mono tabular-nums">共 {revisions.length} 条记录</span>
        </div>
      </div>
      {diffOpen && withSnapshots.length >= 2 ? (
        <CognitiveDiffPanel snapshots={withSnapshots} />
      ) : null}
      <div className="divide-y divide-hairline">
        {revisions.map((item) => (
          <RevisionRow key={item.id} item={item} />
        ))}
      </div>
    </Card>
  );
}
