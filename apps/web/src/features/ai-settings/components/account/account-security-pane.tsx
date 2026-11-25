"use client";

import {
  evaluatePasswordStrength,
  PASSWORD_MAX_LENGTH,
  type PublicUser,
  type SessionSummary,
} from "@kanon/core";
import { Badge, Button, Input, SettingsCard, SettingsRow, SettingsSectionLabel } from "@kanon/ui";
import { IconCheck, IconDevices, IconKey, IconLogout2 } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiChangePassword,
  apiListSessions,
  apiRevokeOtherSessions,
  apiUpdateProfile,
} from "../../lib/account-api";

function ProfileSection({ user }: { user?: PublicUser }) {
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await apiUpdateProfile(name.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("已更新研究员称呼");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SettingsSectionLabel>账号身份</SettingsSectionLabel>
      <SettingsCard>
        {user ? (
          <SettingsRow label="绑定手机号" description="用于个人空间隔离与安全登录">
            <Badge variant="mono">{user.maskedPhone}</Badge>
          </SettingsRow>
        ) : null}
        <SettingsRow label="研究员称呼" description="显示在工作台侧栏与投研备忘录落款">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入称呼"
              className="w-40"
            />
            <Button variant="outline" size="sm" loading={saving} onClick={() => void handleSave()}>
              {!saving ? <IconCheck size={14} stroke={1.5} /> : null}
              <span>保存</span>
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

function usePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const strength = evaluatePasswordStrength(newPassword);

  async function submit() {
    setSaving(true);
    try {
      const res = await apiChangePassword({ currentPassword, newPassword, confirmPassword });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(
        res.revokedOtherSessions > 0
          ? `密码已更新，并自动注销其余 ${res.revokedOtherSessions} 台设备`
          : "登录密码已更新",
      );
    } finally {
      setSaving(false);
    }
  }

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    saving,
    strength,
    submit,
  };
}

function PasswordSection() {
  const f = usePasswordForm();
  return (
    <div>
      <SettingsSectionLabel>修改登录密码</SettingsSectionLabel>
      <div className="space-y-3 rounded-panel border border-hairline bg-surface p-4">
        <Input
          type="password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={f.currentPassword}
          onChange={(e) => f.setCurrentPassword(e.target.value)}
          placeholder="当前密码"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            type="password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={f.newPassword}
            onChange={(e) => f.setNewPassword(e.target.value)}
            placeholder="新密码（8–24位含字母/数字/符号）"
          />
          <Input
            type="password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={f.confirmPassword}
            onChange={(e) => f.setConfirmPassword(e.target.value)}
            placeholder="再次确认新密码"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <IconKey size={14} stroke={1.5} />
            <span>强度：{f.strength.label}</span>
          </span>
          <Button
            variant="primary"
            size="sm"
            loading={f.saving}
            disabled={
              !f.currentPassword || !f.strength.isValid || f.newPassword !== f.confirmPassword
            }
            onClick={() => void f.submit()}
          >
            <span>更新密码</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function useSessionsController() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    void apiListSessions().then((res) => {
      if (res.ok) setSessions(res.sessions);
    });
  }, []);

  async function revokeOthers() {
    setRevoking(true);
    try {
      const res = await apiRevokeOtherSessions();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSessions((prev) => prev.filter((s) => s.isCurrent));
      toast.success(`已安全注销其余 ${res.revokedCount} 个会话`);
    } finally {
      setRevoking(false);
    }
  }

  return { sessions, revoking, revokeOthers };
}

function SessionsSection() {
  const { sessions, revoking, revokeOthers } = useSessionsController();
  const otherCount = sessions.filter((s) => !s.isCurrent).length;
  return (
    <div>
      <SettingsSectionLabel>活跃设备会话</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow
          label={`当前共 ${sessions.length || 1} 个活跃会话`}
          description={
            otherCount > 0 ? `除本机外另有 ${otherCount} 个有效登录会话` : "仅当前设备处于登录状态"
          }
        >
          <div className="flex items-center gap-2">
            <Badge variant="titanium" className="inline-flex items-center gap-1">
              <IconDevices size={13} stroke={1.5} />
              <span>{sessions.length || 1}</span>
            </Badge>
            <Button
              variant="outline"
              size="sm"
              loading={revoking}
              disabled={otherCount === 0}
              onClick={() => void revokeOthers()}
            >
              {!revoking ? <IconLogout2 size={14} stroke={1.5} /> : null}
              <span>注销其他设备</span>
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}

export function AccountSecurityPane({ currentUser }: { currentUser?: PublicUser }) {
  return (
    <div className="space-y-6">
      <ProfileSection user={currentUser} />
      <PasswordSection />
      <SessionsSection />
    </div>
  );
}
