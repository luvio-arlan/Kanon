"use client";

import { Badge, Button, Input, SegmentedTabs } from "@kanon/ui";
import { useState } from "react";
import type { OrgRoleValue, OrgsWorkspaceSnapshot } from "../../lib/orgs-api";

const ROLE_OPTIONS: readonly { id: OrgRoleValue; label: string }[] = [
  { id: "analyst", label: "Analyst" },
  { id: "pm", label: "PM" },
  { id: "compliance", label: "Compliance" },
  { id: "viewer", label: "Viewer" },
];

export function OrgInviteForm({
  orgId,
  busy,
  onInvite,
}: {
  orgId: string;
  busy: boolean;
  onInvite: (orgId: string, phone: string, role: OrgRoleValue) => Promise<boolean>;
}) {
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<OrgRoleValue>("analyst");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="成员 +86 手机号"
          className="flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          disabled={!phone.trim()}
          onClick={() => void onInvite(orgId, phone, role).then((ok) => ok && setPhone(""))}
        >
          <span>邀请</span>
        </Button>
      </div>
      <SegmentedTabs
        layoutId={`org-role-${orgId}`}
        value={role}
        onChange={setRole}
        items={[...ROLE_OPTIONS]}
      />
    </div>
  );
}

export function OrgRestrictForm({
  orgId,
  busy,
  onRestrict,
}: {
  orgId: string;
  busy: boolean;
  onRestrict: (orgId: string, ticker: string, reason: string) => Promise<boolean>;
}) {
  const [ticker, setTicker] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_auto]">
      <Input
        value={ticker}
        onChange={(e) => setTicker(e.target.value.toUpperCase())}
        placeholder="受限代码"
      />
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="合规静默原因"
      />
      <Button
        variant="outline"
        size="sm"
        loading={busy}
        disabled={!ticker.trim()}
        onClick={() =>
          void onRestrict(orgId, ticker, reason).then((ok) => {
            if (!ok) return;
            setTicker("");
            setReason("");
          })
        }
      >
        <span>加入限制名单</span>
      </Button>
    </div>
  );
}

export function AuditLogStrip({ logs }: { logs: OrgsWorkspaceSnapshot["recentAuditLogs"] }) {
  if (logs.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <div className="text-xs font-medium text-ink-secondary">近期审计轨迹</div>
      <div className="divide-y divide-hairline rounded-control border border-hairline bg-canvas/40">
        {logs.slice(0, 6).map((log) => (
          <div
            key={log.id}
            title={log.entryHash ? `哈希链 ${log.entryHash}` : undefined}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 font-mono text-xs tabular-nums"
          >
            <div className="flex items-center gap-2 text-ink-primary">
              <Badge variant="mono">{log.action}</Badge>
              <span className="text-ink-muted">
                {log.targetType}:{log.targetId.slice(0, 12)}
              </span>
            </div>
            <span className="text-ink-muted">{log.createdAt.slice(0, 16).replace("T", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
