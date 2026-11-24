"use client";

import type { ThesisDetail, ThesisSummary } from "@kanon/core";
import { ActionMenu, type ActionMenuItem, cn } from "@kanon/ui";
import {
  IconChevronDown,
  IconFocus2,
  IconSearch,
  IconSettings,
  IconTrendingUp,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";

export function CompanySwitcherTile(p: {
  thesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
  collapsed: boolean;
}) {
  const router = useRouter();
  const items: ActionMenuItem[] = p.allTheses.map((item) => ({
    id: item.id,
    label: `${item.companyName} (${item.ticker})`,
    shortcut: item.riskRewardRatio !== null ? `${item.riskRewardRatio.toFixed(1)}×` : "∞",
    icon: <IconTrendingUp size={15} stroke={1.5} />,
    onSelect: () => {
      if (item.id !== p.thesis.id) router.push(`/thesis/${item.id}`);
    },
  }));

  return (
    <div className={p.collapsed ? "px-2" : "px-3"}>
      <ActionMenu
        ariaLabel="切换研究标的"
        placement="bottom start"
        items={items}
        triggerClassName={cn(
          p.collapsed
            ? "h-10 w-10 justify-center px-0 font-mono text-xs font-semibold"
            : "h-auto w-full justify-between rounded-control bg-surface px-3 py-2.5 text-left shadow-card",
        )}
        trigger={
          p.collapsed ? (
            <span>{p.thesis.ticker.slice(0, 3)}</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold text-ink-primary">
                  {p.thesis.companyName}
                </span>
                <span className="mt-0.5 block font-mono text-xs text-ink-muted tabular-nums">
                  {p.thesis.ticker} · ${p.thesis.currentPrice.toFixed(1)}
                </span>
              </span>
              <IconChevronDown size={15} stroke={1.5} className="shrink-0 text-ink-muted" />
            </span>
          )
        }
      />
    </div>
  );
}

export function ResearchUtilityBar(p: {
  onOpenCommand: () => void;
  onToggleFocus: () => void;
  onOpenSettings: () => void;
}) {
  const btnCls =
    "flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-hairline bg-surface text-xs font-medium text-ink-secondary shadow-button transition-colors hover:border-strong hover:text-ink-primary";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={p.onOpenCommand} title="快捷检索 (⌘K)" className={btnCls}>
        <IconSearch size={15} stroke={1.5} />
        <span>检索</span>
      </button>
      <button type="button" onClick={p.onToggleFocus} title="专注阅读 (F)" className={btnCls}>
        <IconFocus2 size={15} stroke={1.5} />
        <span>专注</span>
      </button>
      <button type="button" onClick={p.onOpenSettings} title="工作台设置与归档" className={btnCls}>
        <IconSettings size={15} stroke={1.5} />
        <span>设置</span>
      </button>
    </div>
  );
}
