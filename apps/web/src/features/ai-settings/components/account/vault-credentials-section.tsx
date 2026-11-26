"use client";

import { Button, Input, SettingsSectionLabel } from "@kanon/ui";
import { IconKey, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  apiDeleteVaultCredential,
  apiSaveVaultCredential,
  type MaskedAiCred,
} from "../../lib/security-vault-api";

const VAULT_PROVIDERS = ["gemini", "anthropic", "openai"] as const;
type VaultProvider = (typeof VAULT_PROVIDERS)[number];

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
          <div className="flex items-center gap-2 font-mono text-ink-primary">
            <span>
              {c.provider} · {c.keyHint}
            </span>
            {c.updatedAt ? (
              <span className="font-sans text-ink-muted">{c.updatedAt.slice(0, 10)}</span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onRemove(c.provider)}>
            <IconTrash size={13} stroke={1.5} />
          </Button>
        </div>
      ))}
    </div>
  );
}

function VaultProviderButtons({
  provider,
  onChange,
}: {
  provider: VaultProvider;
  onChange: (p: VaultProvider) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {VAULT_PROVIDERS.map((p) => (
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

export function VaultSection({
  creds,
  onChanged,
}: {
  creds: readonly MaskedAiCred[];
  onChanged: () => void;
}) {
  const [provider, setProvider] = useState<VaultProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (apiKey.trim().length < 8) return void toast.error("请输入完整 API Key");
    setSaving(true);
    const res = await apiSaveVaultCredential(provider, apiKey.trim());
    setSaving(false);
    if (!res.ok) return void toast.error(res.error);
    setApiKey("");
    toast.success("已保存");
    onChanged();
  }
  return (
    <div>
      <SettingsSectionLabel>服务端密钥库</SettingsSectionLabel>
      <div className="space-y-3 rounded-panel border border-hairline bg-surface p-4 text-xs">
        <VaultProviderButtons provider={provider} onChange={setProvider} />
        <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入 API Key"
          />
          <Button variant="primary" size="sm" loading={saving} onClick={() => void save()}>
            <IconKey size={14} stroke={1.5} />
            <span>保存</span>
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
