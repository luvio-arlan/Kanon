"use client";

import { evaluatePasswordStrength, PASSWORD_MAX_LENGTH, type PublicUser } from "@kanon/core";
import { Badge, Button, Input, SettingsCard, SettingsRow, SettingsSectionLabel } from "@kanon/ui";
import { IconCheck, IconKey } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { apiChangePassword, apiUpdateProfile } from "../../lib/account-api";
import { SessionsSection } from "./sessions-section";

function ProfileSection({ user }: { user?: PublicUser }) {
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await apiUpdateProfile(name.trim());
      if (!res.ok) return void toast.error(res.error);
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
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入称呼"
              className="w-full sm:w-40"
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
      if (!res.ok) return void toast.error(res.error);
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

export function AccountSecurityPane({ currentUser }: { currentUser?: PublicUser }) {
  return (
    <div className="space-y-6">
      <ProfileSection user={currentUser} />
      <PasswordSection />
      <SessionsSection />
    </div>
  );
}
