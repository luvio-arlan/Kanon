"use client";

import { Badge, Button, Sheet } from "@kanon/ui";
import { IconCalendar, IconCheck } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { apiLoadInbox, apiMarkInboxRead, type InboxItemRow } from "../../lib/inbox-ledger-api";

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
        <div key={item.id} className="flex items-start justify-between gap-3 p-4 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={item.severity === "critical" ? "fail" : "titanium"}>
                {item.severity}
              </Badge>
              <span className="font-semibold text-ink-primary">{item.title}</span>
            </div>
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

export function ResearchInboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<InboxItemRow[]>([]);
  const [token, setToken] = useState("");
  const reload = useCallback(() => {
    if (!open) return;
    void apiLoadInbox().then((d) => {
      setItems(d.items);
      setToken(d.calendarToken);
    });
  }, [open]);
  useEffect(() => reload(), [reload]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} title="研究收件箱" size="md">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-panel border border-hairline bg-canvas/50 px-4 py-3 text-xs">
          <span className="text-ink-secondary">催化剂 .ics 日历订阅</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!token}
            onClick={() => {
              void navigator.clipboard.writeText(
                `${window.location.origin}/api/calendar/${token}.ics`,
              );
              toast.success("已复制催化剂 .ics 日历订阅地址");
            }}
          >
            <IconCalendar size={14} stroke={1.5} />
            <span>复制订阅链接</span>
          </Button>
        </div>
        <InboxItemList items={items} onMarkRead={(id) => void apiMarkInboxRead(id).then(reload)} />
      </div>
    </Sheet>
  );
}
