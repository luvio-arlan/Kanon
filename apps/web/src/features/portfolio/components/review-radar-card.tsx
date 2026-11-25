"use client";

import type { PortfolioReviewRadarReport, ThesisReviewRadarItem } from "@kanon/core";
import { Badge, buttonVariants, Card, cn } from "@kanon/ui";
import { IconAlertTriangle, IconArrowUpRight, IconClockCheck } from "@tabler/icons-react";
import Link from "next/link";

function RadarItemRow({ item }: { item: ThesisReviewRadarItem }) {
  const tone = item.level === "urgent_review" ? "warn" : "coral";
  const label = item.level === "urgent_review" ? "待复盘" : "催化临近";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/35">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="titanium">{item.ticker}</Badge>
          <Badge variant={tone}>{label}</Badge>
          <span className="font-mono text-xs text-ink-muted">
            {item.daysSinceUpdate === 0 ? "今日更新" : `${item.daysSinceUpdate} 天前更新`}
          </span>
        </div>
        <div className="text-xs text-ink-secondary">{item.reason}</div>
      </div>
      <Link
        href={`/thesis/${item.thesisId}?step=${item.targetStep}`}
        className={cn(buttonVariants({ variant: "outline", size: "xs" }), "shrink-0")}
      >
        <span>{item.targetStep === 5 ? "去复盘" : "核对催化"}</span>
        <IconArrowUpRight size={13} stroke={1.5} />
      </Link>
    </div>
  );
}

export function ReviewRadarCard({ report }: { report: PortfolioReviewRadarReport }) {
  const actionable = report.items.filter((i) => i.level !== "healthy");
  if (actionable.length === 0) {
    return (
      <Card className="flex items-center justify-between gap-3 px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-secondary">
          <IconClockCheck size={16} stroke={1.5} className="text-status-pass" />
          <span>全仓研究新鲜度良好，暂无超期未复盘或预警漂移标的</span>
        </span>
        <Badge variant="pass">状态健康</Badge>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2">
          <IconAlertTriangle size={16} stroke={1.5} className="text-accent-coral" />
          <span className="text-sm font-semibold text-ink-primary">财报复盘与假设漂移雷达</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {report.warningCount > 0 ? (
            <Badge variant="warn">假设预警 {report.warningCount}</Badge>
          ) : null}
          {report.staleCount > 0 ? (
            <Badge variant="default">超 30 天未复盘 {report.staleCount}</Badge>
          ) : null}
          <Badge variant="coral">高影响待验 {report.upcomingHighImpactCount}</Badge>
        </div>
      </div>
      <div className="divide-y divide-hairline">
        {actionable.map((item) => (
          <RadarItemRow key={item.thesisId} item={item} />
        ))}
      </div>
    </Card>
  );
}
