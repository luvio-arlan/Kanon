"use client";

import type {
  CatalystCategory,
  CatalystDirection,
  CatalystStatus,
  ThesisCatalyst,
  ThesisDetail,
} from "@kanon/core";
import { Badge, buttonVariants, Card, SegmentedTabs } from "@kanon/ui";
import { IconArrowUpRight, IconCalendarEvent } from "@tabler/icons-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type CatalystFilter = "all" | "upcoming" | "high" | "resolved";

interface FlatCatalystItem {
  thesis: ThesisDetail;
  catalyst: ThesisCatalyst;
}

const CATEGORY_LABEL: Record<CatalystCategory, string> = {
  earnings: "财报节点",
  product: "产品周期",
  capital: "资本配置",
  regulatory: "政策监管",
  macro: "宏观行业",
};

const DIRECTION_STYLE: Record<
  CatalystDirection,
  { label: string; variant: "pass" | "fail" | "warn" }
> = {
  bullish: { label: "偏多催化", variant: "pass" },
  bearish: { label: "风险考验", variant: "fail" },
  binary: { label: "双向拐点", variant: "warn" },
};

const STATUS_STYLE: Record<
  CatalystStatus,
  { label: string; variant: "coral" | "pass" | "default" }
> = {
  upcoming: { label: "待验证", variant: "coral" },
  realized: { label: "已兑现", variant: "pass" },
  missed: { label: "未兑现", variant: "default" },
};

function CatalystRow({ item }: { item: FlatCatalystItem }) {
  const { thesis, catalyst } = item;
  const dir = DIRECTION_STYLE[catalyst.direction];
  const st = STATUS_STYLE[catalyst.status];

  return (
    <div className="flex flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="mono">{catalyst.dateLabel}</Badge>
          <Badge variant="titanium">{thesis.ticker}</Badge>
          <Badge variant="default">{CATEGORY_LABEL[catalyst.category]}</Badge>
          <Badge variant={dir.variant}>{dir.label}</Badge>
          {catalyst.impact === "high" ? <Badge variant="coral">高影响</Badge> : null}
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
        <div className="text-sm font-semibold text-ink-primary">{catalyst.title}</div>
        <div className="font-mono text-xs text-ink-secondary">
          验证口径：{catalyst.verificationMetric}
        </div>
        {catalyst.note ? <p className="text-xs text-ink-muted">{catalyst.note}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/thesis/${thesis.id}?step=2`}
          className={buttonVariants({ variant: "outline", size: "xs" })}
        >
          <span>{thesis.companyName}</span>
          <IconArrowUpRight size={13} stroke={1.5} />
        </Link>
      </div>
    </div>
  );
}

function flattenCatalysts(theses: readonly ThesisDetail[]): FlatCatalystItem[] {
  const items: FlatCatalystItem[] = [];
  for (const thesis of theses) {
    if (thesis.status !== "active") continue;
    for (const catalyst of thesis.catalysts) items.push({ thesis, catalyst });
  }
  return items.sort((a, b) => {
    const rankDiff =
      (a.catalyst.status === "upcoming" ? 0 : 1) - (b.catalyst.status === "upcoming" ? 0 : 1);
    if (rankDiff !== 0) return rankDiff;
    return a.catalyst.impact === "high" && b.catalyst.impact !== "high" ? -1 : 1;
  });
}

function filterCatalysts(items: readonly FlatCatalystItem[], filter: CatalystFilter) {
  if (filter === "upcoming") return items.filter((i) => i.catalyst.status === "upcoming");
  if (filter === "high") return items.filter((i) => i.catalyst.impact === "high");
  if (filter === "resolved") return items.filter((i) => i.catalyst.status !== "upcoming");
  return items;
}

export function CatalystCalendarBoard({ theses }: { theses: readonly ThesisDetail[] }) {
  const [filter, setFilter] = useState<CatalystFilter>("upcoming");
  const allItems = useMemo(() => flattenCatalysts(theses), [theses]);
  const visible = useMemo(() => filterCatalysts(allItems, filter), [allItems, filter]);
  const upcomingCount = allItems.filter((i) => i.catalyst.status === "upcoming").length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex items-center gap-2">
          <IconCalendarEvent size={17} stroke={1.5} className="text-accent-coral" />
          <span className="text-sm font-semibold text-ink-primary">全仓催化剂与重估日程</span>
        </div>
        <SegmentedTabs
          layoutId="catalyst-board-filter"
          value={filter}
          onChange={setFilter}
          items={[
            { id: "upcoming", label: "待验证", count: upcomingCount },
            { id: "high", label: "高影响" },
            { id: "all", label: "全部", count: allItems.length },
            { id: "resolved", label: "已归档" },
          ]}
        />
      </div>
      {visible.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-ink-muted">
          当前筛选条件下暂无催化剂记录，可在单标的 Step 2 增补财报与产品周期事件。
        </div>
      ) : (
        <div className="divide-y divide-hairline">
          {visible.map((item) => (
            <CatalystRow key={`${item.thesis.id}-${item.catalyst.id}`} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}
