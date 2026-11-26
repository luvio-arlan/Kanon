"use client";

import { Badge, Button, Input, SettingsCard, SettingsRow, SettingsSectionLabel } from "@kanon/ui";
import { IconKey, IconShieldLock, IconTrash } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  apiConfirmTotp,
  apiDeleteVaultCredential,
  apiEnrollTotp,
  apiLoadSecurityVault,
  apiSaveVaultCredential,
  type MaskedAiCred,
} from "../../lib/security-vault-api";

function TotpEnrollRow({
  secret,
  code,
  onCode,
  onConfirm,
}: {
  secret: string;
  code: string;
  onCode: (v: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2.5 border-t border-hairline px-4 py-3 text-xs">
      <div className="font-mono text-ink-primary">密钥：{secret}</div>
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => onCode(e.target.value)}
          placeholder="6 位验证码"
          className="w-40"
        />
        <Button variant="primary" size="sm" onClick={onConfirm}>
          <span>验证并启用</span>
        </Button>
      </div>
    </div>
  );
}

function TotpSection({ enabled, onConfirmed }: { enabled: boolean; onConfirmed: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function enroll() {
    const next = await apiEnrollTotp();
    if (!next) return void toast.error("初始化 2FA 失败");
    setSecret(next);
  }
  async function confirm() {
    if (!(await apiConfirmTotp(code.trim()))) return void toast.error("验证码错误");
    setSecret(null);
    setCode("");
    toast.success("已开启 TOTP 二步验证");
    onConfirmed();
  }
  return (
    <div>
      <SettingsSectionLabel>二步验证 (TOTP 2FA)</SettingsSectionLabel>
      <SettingsCard>
        <SettingsRow label="动态口令保护" description="兼容 1Password / Google Authenticator">
          {enabled ? (
            <Badge variant="pass">已开启</Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void enroll()}>
              <IconShieldLock size={14} stroke={1.5} />
              <span>配置 2FA</span>
            </Button>
          )}
        </SettingsRow>
        {secret ? (
          <TotpEnrollRow
            secret={secret}
            code={code}
            onCode={setCode}
            onConfirm={() => void confirm()}
          />
        ) : null}
      </SettingsCard>
    </div>
  );
}

function VaultCredsList({
  creds,
  onRemove,
}: {
  creds: readonly MaskedAiCred[];
  onRemove: (provider: string) => void;
}) {
  if (creds.length === 0) return null;
  return (
    <div className="divide-y divide-hairline border-t border-hairline pt-2">
      {creds.map((c) => (
        <div key={c.id} className="flex items-center justify-between py-1.5">
          <span className="font-mono text-ink-primary">
            {c.provider} · {c.keyHint}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onRemove(c.provider)}>
            <IconTrash size={13} stroke={1.5} />
          </Button>
        </div>
      ))}
    </div>
  );
}

function VaultProviderPicker({
  provider,
  onChange,
}: {
  provider: "gemini" | "anthropic" | "openai";
  onChange: (p: "gemini" | "anthropic" | "openai") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(["gemini", "anthropic", "openai"] as const).map((p) => (
        <Button
          key={p}
          variant={provider === p ? "primary" : "outline"}
          size="sm"
          onClick={() => onChange(p)}
        >
          <span>{p}</span>
        </Button>
      ))}
    </div>
  );
}

function VaultSection({
  creds,
  onChanged,
}: {
  creds: readonly MaskedAiCred[];
  onChanged: () => void;
}) {
  const [provider, setProvider] = useState<"gemini" | "anthropic" | "openai">("gemini");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (apiKey.trim().length < 8) return void toast.error("请输入完整 API Key");
    setSaving(true);
    const ok = await apiSaveVaultCredential(provider, apiKey.trim());
    setSaving(false);
    if (!ok) return void toast.error("保存失败");
    setApiKey("");
    toast.success("已通过 AES-256-GCM 加密存入服务端密钥库");
    onChanged();
  }
  return (
    <div>
      <SettingsSectionLabel>服务端加密 BYOK 密钥库</SettingsSectionLabel>
      <div className="space-y-3 rounded-panel border border-hairline bg-surface p-4 text-xs">
        <VaultProviderPicker provider={provider} onChange={setProvider} />
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="服务端加密 API Key"
          />
          <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
            <IconKey size={14} stroke={1.5} />
            <span>加密保存</span>
          </Button>
        </div>
        <VaultCredsList
          creds={creds}
          onRemove={(p) => void apiDeleteVaultCredential(p).then(onChanged)}
        />
      </div>
    </div>
  );
}

export function TotpAndVaultCard() {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [creds, setCreds] = useState<MaskedAiCred[]>([]);
  const load = useCallback(() => {
    void apiLoadSecurityVault().then((res) => {
      setTotpEnabled(res.totpEnabled);
      setCreds(res.credentials);
    });
  }, []);
  useEffect(() => load(), [load]);

  return (
    <div className="space-y-6">
      <TotpSection enabled={totpEnabled} onConfirmed={load} />
      <VaultSection creds={creds} onChanged={load} />
    </div>
  );
}
