"use client";

import { Button } from "@kanon/ui";
import { IconPlus, IconRotate2 } from "@tabler/icons-react";
import type { CockpitFilter } from "./cockpit-header";

export interface CockpitEmptyStateProps {
  filter: CockpitFilter;
  query: string;
  totalActiveCount: number;
  onResetFilters: () => void;
  onNewThesis: () => void;
}

function resolveEmptyCopy(filter: CockpitFilter, query: string, totalActiveCount: number) {
  if (query.trim()) {
    return {
      title: `未找到「${query.trim()}」`,
      hint: "试试股票代码或清除搜索条件",
      action: "reset" as const,
    };
  }
  if (totalActiveCount === 0) {
    return {
      title: "从第一家好公司开始",
      hint: "按五步框架拆解商业模式、核心假设与三年赔率",
      action: "create" as const,
    };
  }
  if (filter === "attractive") {
    return {
      title: "暂无高赔率标的",
      hint: "赔率 ≥ 2.0× 且具安全边际的标的会自动出现在这里",
      action: "reset" as const,
    };
  }
  if (filter === "attention") {
    return {
      title: "当前没有待处理的假设提醒",
      hint: "全部核心假设状态清晰，可继续追踪其他标的",
      action: "reset" as const,
    };
  }
  return {
    title: "当前视图暂无标的",
    hint: "可返回全部视图或新建一份研究档案",
    action: "reset" as const,
  };
}

export function CockpitEmptyState(props: CockpitEmptyStateProps) {
  const copy = resolveEmptyCopy(props.filter, props.query, props.totalActiveCount);

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-card border border-hairline bg-surface/80 px-6 py-12 text-center shadow-card">
      <h2 className="text-base font-medium text-ink-primary">{copy.title}</h2>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-muted">{copy.hint}</p>
      <div className="mt-5 flex items-center gap-2">
        {copy.action === "reset" ? (
          <Button variant="outline" size="sm" onClick={props.onResetFilters}>
            <IconRotate2 size={14} stroke={1.5} />
            <span>查看全部标的</span>
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={props.onNewThesis}>
          <IconPlus size={14} stroke={1.5} />
          <span>新建标的</span>
        </Button>
      </div>
    </div>
  );
}
