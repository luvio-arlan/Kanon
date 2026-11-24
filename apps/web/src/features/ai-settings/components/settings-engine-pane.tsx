"use client";

import type { ByokProvider } from "@kanon/ai";
import {
  Badge,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Input,
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
} from "@kanon/ui";
import { IconChevronDown, IconShieldLock } from "@tabler/icons-react";
import { useState } from "react";

const PROVIDERS: ReadonlyArray<{ id: ByokProvider; label: string }> = [
  { id: "gemini", label: "Gemini" },
  { id: "anthropic", label: "Claude" },
  { id: "openai", label: "OpenAI" },
];

function OverrideFooterBar(p: { hasByok: boolean; onClear: () => void; onSave: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
        <IconShieldLock size={14} stroke={1.5} className="text-status-pass" />
        <span>仅保存于本机浏览器，不上传服务器</span>
      </span>
      <div className="flex items-center gap-2">
        {p.hasByok ? (
          <Button variant="ghost" size="sm" onClick={p.onClear}>
            恢复默认
          </Button>
        ) : null}
        <Button variant="primary" size="sm" onClick={p.onSave}>
          保存覆盖
        </Button>
      </div>
    </div>
  );
}

function CustomOverridePanel(p: {
  provider: ByokProvider;
  apiKey: string;
  hasByok: boolean;
  onProvider: (next: ByokProvider) => void;
  onApiKey: (next: string) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-hairline bg-muted/35 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-primary">模型服务商</span>
        <ButtonGroup ariaLabel="选择模型服务商">
          {PROVIDERS.map((item) => (
            <ButtonGroupItem
              key={item.id}
              size="sm"
              selected={p.provider === item.id}
              onClick={() => p.onProvider(item.id)}
            >
              {item.label}
            </ButtonGroupItem>
          ))}
        </ButtonGroup>
      </div>
      <Input
        type="password"
        maxLength={160}
        value={p.apiKey}
        onChange={(e) => p.onApiKey(e.target.value)}
        placeholder="输入个人 API Key（留空即回退后台默认引擎）"
        className="font-mono"
      />
      <OverrideFooterBar hasByok={p.hasByok} onClear={p.onClear} onSave={p.onSave} />
    </div>
  );
}

export function EngineSettingsPane(p: {
  provider: ByokProvider;
  apiKey: string;
  hasByok: boolean;
  onProvider: (next: ByokProvider) => void;
  onApiKey: (next: string) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  const [showCustom, setShowCustom] = useState(p.hasByok);
  return (
    <div className="space-y-6">
      <div>
        <SettingsSectionLabel>运行状态</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow
            label="智能投研与一阶分析引擎"
            description="后台统一托管配置，无需用户额外准备密钥即可使用"
          >
            <Badge variant="pass">{p.hasByok ? "已启用自定义密钥" : "后台已就绪"}</Badge>
          </SettingsRow>
          <SettingsRow
            label="自定义模型密钥（高级）"
            description="可选覆盖默认引擎，密钥仅留存在本机浏览器"
          >
            <Button variant="ghost" size="sm" onClick={() => setShowCustom((v) => !v)}>
              <span>{showCustom ? "收起" : "展开配置"}</span>
              <IconChevronDown
                size={15}
                stroke={1.5}
                className={showCustom ? "rotate-180 transition-transform" : "transition-transform"}
              />
            </Button>
          </SettingsRow>
        </SettingsCard>
      </div>
      {showCustom ? <CustomOverridePanel {...p} /> : null}
    </div>
  );
}
