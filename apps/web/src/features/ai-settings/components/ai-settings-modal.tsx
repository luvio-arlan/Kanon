"use client";

import type { ByokProvider } from "@kanon/ai";
import { Button, cn, DialogModal, Input } from "@kanon/ui";
import { IconCpu, IconShieldLock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readByokConfig, writeByokConfig } from "../lib/byok-storage";

export interface AiSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const PROVIDERS: ReadonlyArray<{ id: ByokProvider; label: string; modelHint: string }> = [
  { id: "gemini", label: "Gemini", modelHint: "gemini-2.5-flash" },
  { id: "anthropic", label: "Claude", modelHint: "claude-sonnet-4" },
  { id: "openai", label: "OpenAI", modelHint: "gpt-4.1-mini" },
];

function ProviderSelector({
  provider,
  onSelect,
}: {
  provider: ByokProvider;
  onSelect: (next: ByokProvider) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PROVIDERS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            "cursor-pointer rounded-control border p-3 text-left transition-colors",
            provider === item.id
              ? "border-accent-coral bg-accent-coral-soft/60 text-ink-primary"
              : "border-hairline bg-surface text-ink-secondary hover:border-strong",
          )}
        >
          <div className="text-sm font-semibold">{item.label}</div>
          <div className="mt-0.5 font-mono text-xs text-ink-muted">{item.modelHint}</div>
        </button>
      ))}
    </div>
  );
}

function ByokKeyField({ apiKey, onChange }: { apiKey: string; onChange: (next: string) => void }) {
  return (
    <>
      <div>
        <label htmlFor="byok-key" className="mb-1.5 block text-xs font-medium text-ink-muted">
          API Key（留空即使用本地一阶分析）
        </label>
        <Input
          id="byok-key"
          type="password"
          value={apiKey}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-... / AIza..."
          className="font-mono"
        />
      </div>
      <div className="flex items-start gap-2 rounded-control bg-muted/70 p-3 text-xs leading-relaxed text-ink-secondary">
        <IconShieldLock size={15} stroke={1.5} className="mt-0.5 shrink-0 text-status-pass" />
        <span>
          密钥仅保存在当前浏览器本地，单次调用时通过请求头透传给模型接口，绝不写入数据库。所有财务事实均锚定
          SEC 缓存，大模型禁止编造数字。
        </span>
      </div>
    </>
  );
}

function AiSettingsFooter({ onClear, onSave }: { onClear: () => void; onSave: () => void }) {
  return (
    <>
      <Button variant="outline" size="md" onClick={onClear}>
        清除密钥
      </Button>
      <Button variant="primary" size="md" onClick={onSave}>
        保存引擎设置
      </Button>
    </>
  );
}

export function AiSettingsModal({ open, onOpenChange, onChanged }: AiSettingsModalProps) {
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) return;
    const saved = readByokConfig();
    if (!saved) return;
    setProvider(saved.provider);
    setApiKey(saved.apiKey);
  }, [open]);

  function finish(nextConfig: { provider: ByokProvider; apiKey: string } | null, msg: string) {
    writeByokConfig(nextConfig);
    if (!nextConfig) setApiKey("");
    toast.success(msg);
    onChanged?.();
    onOpenChange(false);
  }

  const handleSave = () =>
    apiKey.trim()
      ? finish(
          { provider, apiKey: apiKey.trim() },
          `已启用 BYOK 云端模型（${provider.toUpperCase()}）`,
        )
      : finish(null, "已切换为本地确定性一阶分析引擎");

  return (
    <DialogModal
      open={open}
      onOpenChange={onOpenChange}
      title="投研副驾驶引擎（BYOK）"
      subtitle="可选接入自有大模型 Key；未配置时使用零成本一阶确定性引擎"
      icon={<IconCpu size={18} stroke={1.5} />}
      footer={
        <AiSettingsFooter
          onClear={() => finish(null, "已清除密钥，切回本地一阶引擎")}
          onSave={handleSave}
        />
      }
    >
      <div className="space-y-4">
        <ProviderSelector provider={provider} onSelect={setProvider} />
        <ByokKeyField apiKey={apiKey} onChange={setApiKey} />
      </div>
    </DialogModal>
  );
}
