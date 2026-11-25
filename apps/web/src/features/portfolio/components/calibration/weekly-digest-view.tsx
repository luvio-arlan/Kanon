"use client";

import { formatWeeklyDigestMarkdown, type WeeklyIcDigest } from "@kanon/core";
import { Badge, Button, Card } from "@kanon/ui";
import { IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

const IMPACT_CN: Record<string, string> = {
  high: "高影响",
  medium: "中影响",
  low: "低影响",
};

function DigestListCard(props: {
  title: string;
  emptyText: string;
  items: ReadonlyArray<{
    key: string;
    code: string;
    title: string;
    detail: string;
    urgent?: boolean;
  }>;
}) {
  return (
    <Card className="divide-y divide-hairline overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="text-xs font-semibold text-ink-primary">{props.title}</h3>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{props.items.length}</span>
      </div>
      {props.items.length === 0 ? (
        <p className="px-4 py-3 text-xs text-ink-muted">{props.emptyText}</p>
      ) : (
        props.items.map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 font-medium text-ink-primary">
                <Badge variant={item.urgent ? "warn" : "titanium"}>{item.code}</Badge>
                <span className="truncate">{item.title}</span>
              </div>
              <p className="text-ink-secondary">{item.detail}</p>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function buildDigestAlertItems(digest: WeeklyIcDigest) {
  return [
    ...digest.warningHypotheses.map((w, idx) => ({
      key: `w-${w.ticker}-${idx}`,
      code: w.ticker,
      title: w.title,
      detail: `证伪阈值：${w.threshold}`,
      urgent: true,
    })),
    ...digest.divergentCrossChecks.map((d, idx) => ({
      key: `d-${d.ticker}-${idx}`,
      code: d.ticker,
      title: d.title,
      detail: d.threshold,
      urgent: true,
    })),
  ];
}

function DigestSummaryCard({ digest, onCopy }: { digest: WeeklyIcDigest; onCopy: () => void }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="space-y-0.5">
        <div className="text-xs text-ink-muted">生成时间 {digest.generatedAt.slice(0, 10)}</div>
        <div className="text-sm font-medium text-ink-primary">{digest.summaryLine}</div>
      </div>
      <Button variant="titanium" size="xs" onClick={onCopy}>
        <IconCopy size={13} stroke={1.5} />
        <span>复制周报 Markdown</span>
      </Button>
    </Card>
  );
}

export function WeeklyDigestView({ digest }: { digest: WeeklyIcDigest }) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatWeeklyDigestMarkdown(digest));
      toast.success("已复制周报 Markdown");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="space-y-4">
      <DigestSummaryCard digest={digest} onCopy={() => void handleCopy()} />
      <DigestListCard
        title="复核雷达关注标的"
        emptyText="全部在研标的复核节奏正常。"
        items={digest.attentionTheses.map((item) => ({
          key: item.ticker,
          code: item.ticker,
          title: item.companyName,
          detail: item.reason,
          urgent: item.level === "urgent",
        }))}
      />
      <DigestListCard
        title="待兑现催化剂"
        emptyText="近期无待验证催化剂。"
        items={digest.upcomingCatalysts.map((c, idx) => ({
          key: `${c.ticker}-${idx}`,
          code: c.ticker,
          title: c.title,
          detail: `${c.dateLabel} · ${IMPACT_CN[c.impact] ?? c.impact}`,
        }))}
      />
      <DigestListCard
        title="证伪预警与分歧印证"
        emptyText="暂无假设预警或产业链口径分歧。"
        items={buildDigestAlertItems(digest)}
      />
    </div>
  );
}
