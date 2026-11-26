"use client";

import { Badge, Button, Sheet } from "@kanon/ui";
import { IconBell, IconCalendar, IconCheck, IconChecks, IconDots } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type AlertRuleRow,
  apiLoadInbox,
  apiMarkAllInboxRead,
  apiMarkInboxRead,
  apiRotateCalendarToken,
  apiUpsertAlertRule,
  type InboxItemRow,
} from "../../lib/inbox-ledger-api";

function severityRailClass(severity: InboxItemRow["severity"]): string {
  if (severity === "critical") return "border-l-2 border-l-status-fail";
  if (severity === "warn") return "border-l-2 border-l-status-warn";
  return "border-l-2 border-l-hairline";
}

function InboxItemList({
  items,
  onMarkRead,
}: {
  items: readonly InboxItemRow[];
  onMarkRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-ink-muted">
        暂无待处理的 8-K 警示或研究提醒。
      </div>
    );
  }
  return (
    <div className="divide-y divide-hairline rounded-panel border border-hairline bg-surface">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-start justify-between gap-3 p-4 text-xs ${severityRailClass(item.severity)}`}
        >
          <div className="min-w-0 space-y-1">
            <div className="font-semibold text-ink-primary">{item.title}</div>
            <p className="leading-relaxed text-ink-secondary">{item.body}</p>
          </div>
          {!item.readAt ? (
            <Button variant="ghost" size="sm" onClick={() => onMarkRead(item.id)}>
              <IconCheck size={14} stroke={1.5} />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function AlertRulesStrip({
  rules,
  onToggleForecastDue,
}: {
  rules: readonly AlertRuleRow[];
  onToggleForecastDue: (existing?: AlertRuleRow) => void;
}) {
  const forecastRule = rules.find((r) => r.kind === "forecast_due");
  const activeCount = rules.filter((r) => r.enabled).length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-canvas/40 px-3.5 py-2.5 text-xs">
      <div className="flex items-center gap-2 text-ink-secondary">
        <IconBell size={14} stroke={1.5} className="text-ink-muted" />
        <span>自动监控规则</span>
        <Badge variant="mono">{activeCount} 条生效</Badge>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onToggleForecastDue(forecastRule)}>
        <span>{forecastRule?.enabled ? "关闭预测到期提醒" : "开启预测到期提醒"}</span>
      </Button>
    </div>
  );
}

function InboxHeaderBar({
  unreadCount,
  menuOpen,
  onToggleMenu,
  onMarkAll,
  onRotateCal,
}: {
  unreadCount: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMarkAll: () => void;
  onRotateCal: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-ink-muted">
        {unreadCount > 0 ? `${unreadCount} 条未读` : "全部已读"}
      </div>
      <div className="relative flex items-center gap-1.5">
        {unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            <IconChecks size={14} stroke={1.5} />
            <span>全部已读</span>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" aria-label="更多操作" onClick={onToggleMenu}>
          <IconDots size={14} stroke={1.5} />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-9 z-10 w-48 rounded-panel border border-hairline bg-surface p-1.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={onRotateCal}
            >
              <IconCalendar size={14} stroke={1.5} />
              <span>生成并复制 .ics 订阅</span>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ResearchInboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<InboxItemRow[]>([]);
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const reload = useCallback(() => {
    if (!open) return;
    void apiLoadInbox().then((d) => {
      setItems(d.items);
      setRules(d.rules);
    });
  }, [open]);
  useEffect(() => reload(), [reload]);

  async function copyRotatedCalendarUrl() {
    const token = await apiRotateCalendarToken();
    if (!token) return void toast.error("签发订阅地址失败");
    await navigator.clipboard.writeText(`${window.location.origin}/api/calendar/${token}.ics`);
    setMenuOpen(false);
    toast.success("已签发并复制新的 .ics 订阅地址");
  }

  async function toggleForecastRule(existing?: AlertRuleRow) {
    const nextEnabled = !existing?.enabled;
    const ok = await apiUpsertAlertRule({
      id: existing?.id,
      kind: "forecast_due",
      enabled: nextEnabled,
      configJson: {},
    });
    if (!ok) return void toast.error("更新规则失败");
    toast.success(nextEnabled ? "已开启预测到期自动提醒" : "已关闭预测到期提醒");
    reload();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="研究收件箱" size="md">
      <div className="space-y-4">
        <InboxHeaderBar
          unreadCount={items.filter((i) => !i.readAt).length}
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onMarkAll={() => void apiMarkAllInboxRead().then(reload)}
          onRotateCal={() => void copyRotatedCalendarUrl()}
        />
        <AlertRulesStrip rules={rules} onToggleForecastDue={(r) => void toggleForecastRule(r)} />
        <InboxItemList items={items} onMarkRead={(id) => void apiMarkInboxRead(id).then(reload)} />
      </div>
    </Sheet>
  );
}
