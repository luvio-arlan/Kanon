"use client";

import type { RevisionStep, ThesisRevision } from "@kanon/core";
import { Badge, Card } from "@kanon/ui";
import { IconHistory } from "@tabler/icons-react";

const STEP_LABELS: Record<RevisionStep, string> = {
  create: "建档立项",
  business_filter: "商业模式",
  hypotheses: "核心假设",
  cross_checks: "交叉验证",
  valuation: "三情景估值",
  price_anchor: "现价校准",
  discipline: "交易纪律",
};

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
      <div className="mb-3 flex items-center justify-between border-b border-hairline pb-3 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
          <IconHistory size={14} stroke={1.5} />
          <span>跨季度研究演进日志（Postgres 持久化）</span>
        </span>
        <span className="font-mono tabular-nums">共 {revisions.length} 条记录</span>
      </div>
      <div className="divide-y divide-hairline">
        {revisions.map((item) => (
          <RevisionRow key={item.id} item={item} />
        ))}
      </div>
    </Card>
  );
}
