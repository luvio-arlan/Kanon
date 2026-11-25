"use client";

import type { SessionSummary } from "@kanon/core";
import { Badge, Button, SettingsCard, SettingsRow, SettingsSectionLabel } from "@kanon/ui";
import { IconDevices, IconLogout2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiListSessions, apiRevokeOtherSessions } from "../../lib/account-api";

function resolveSessionMeta(loading: boolean, loadError: boolean, total: number, other: number) {
  if (loading) return { label: "正在读取活跃会话…", description: "仅当前设备处于登录状态" };
  if (loadError) return { label: "未能读取设备会话", description: "请检查网络连接后重试" };
  return {
    label: `当前共 ${total || 1} 个活跃会话`,
    description: other > 0 ? `除本机外另有 ${other} 个有效登录会话` : "仅当前设备处于登录状态",
  };
}

function useSessionsController() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [revoking, setRevoking] = useState(false);

  const load = async () => {
    setStatus("loading");
    const res = await apiListSessions();
    if (res.ok) setSessions(res.sessions);
    setStatus(res.ok ? "ready" : "error");
  };

  useEffect(() => {
    let active = true;
    void apiListSessions().then((res) => {
      if (!active) return;
      if (res.ok) setSessions(res.sessions);
      setStatus(res.ok ? "ready" : "error");
    });
    return () => {
      active = false;
    };
  }, []);

  async function revokeOthers() {
    setRevoking(true);
    try {
      const res = await apiRevokeOtherSessions();
      if (!res.ok) return void toast.error(res.error);
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast.success(`已安全注销其余 ${res.revokedCount} 个会话`);
    } finally {
      setRevoking(false);
    }
  }
  return {
    sessions,
    loading: status === "loading",
    loadError: status === "error",
    revoking,
    revokeOthers,
    retry: () => void load(),
  };
}

export function SessionsSection() {
  const s = useSessionsController();
  const otherCount = s.sessions.filter((item) => !item.isCurrent).length;
  const meta = resolveSessionMeta(s.loading, s.loadError, s.sessions.length, otherCount);
  return (
    <div>
      <SettingsSectionLabel>活跃设备会话</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label={meta.label} description={meta.description}>
          {s.loadError ? (
            <Button variant="outline" size="sm" onClick={s.retry}>
              重试
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="titanium" className="inline-flex items-center gap-1">
                <IconDevices size={13} stroke={1.5} />
                <span>{s.loading ? "—" : s.sessions.length || 1}</span>
              </Badge>
              <Button
                variant="outline"
                size="sm"
                loading={s.revoking}
                disabled={s.loading || otherCount === 0}
                onClick={() => void s.revokeOthers()}
              >
                {!s.revoking ? <IconLogout2 size={14} stroke={1.5} /> : null}
                <span>注销其他设备</span>
              </Button>
            </div>
          )}
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
