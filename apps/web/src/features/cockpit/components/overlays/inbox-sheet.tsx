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

function formatRuleLabel(rule: AlertRuleRow): string {
  if (rule.kind === "price_hurdle") {
    const p = Number(rule.configJson?.targetPrice);
    const dir = rule.configJson?.direction === "above" ? "≥" : "≤";
    return Number.isFinite(p) && p > 0 ? `价格 ${dir} $${p.toFixed(2)}` : "价格阈值";
  }
  if (rule.kind === "pe_band_breach") return "P/E 分位越界";
  if (rule.kind === "form8k_redflag") return "8-K 重大公告";
  return "预测到期结算";
}

function AlertRulesStrip({
  rules,
  onToggleRule,
}: {
  rules: readonly AlertRuleRow[];
  onToggleRule: (rule: AlertRuleRow) => void;
}) {
  const forecastRule = rules.find((r) => r.kind === "forecast_due");
  const activeCount = rules.filter((r) => r.enabled).length;
  return (
    <div className="space-y-2 rounded-control border border-hairline bg-canvas/40 px-3.5 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-ink-secondary">
          <IconBell size={14} stroke={1.5} className="text-ink-muted" />
          <span>监控规则</span>
          <Badge variant="mono">{activeCount} 条生效</Badge>
        </div>
        {!forecastRule ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onToggleRule({ id: "", kind: "forecast_due", enabled: false, configJson: {} })
            }
          >
            <span>开启预测到期</span>
          </Button>
        ) : null}
      </div>
      {rules.length > 0 ? (
        <div className="divide-y divide-hairline border-t border-hairline pt-1.5">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="truncate font-mono text-ink-secondary tabular-nums">
                {formatRuleLabel(r)}
              </span>
              <button
                type="button"
                onClick={() => onToggleRule(r)}
                className="cursor-pointer font-mono text-xs text-ink-muted hover:text-ink-primary"
              >
                {r.enabled ? "●" : "○"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
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

  async function toggleRule(existing: AlertRuleRow) {
    const nextEnabled = !existing.enabled;
    const ok = await apiUpsertAlertRule({
      thesisId: existing.thesisId ?? undefined,
      kind: existing.kind,
      enabled: nextEnabled,
      configJson: existing.configJson ?? {},
    });
    if (!ok) return void toast.error("更新规则失败");
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
        <InboxItemList items={items} onMarkRead={(id) => void apiMarkInboxRead(id).then(reload)} />
        <AlertRulesStrip rules={rules} onToggleRule={(r) => void toggleRule(r)} />
      </div>
    </Sheet>
  );
}
