"use client";

import type { ByokProvider } from "@kanon/core";
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

const PROVIDERS: ReadonlyArray<{ id: ByokProvider; label: string; defaultModel: string }> = [
  { id: "gemini", label: "Gemini", defaultModel: "gemini-2.5-flash" },
  { id: "anthropic", label: "Claude", defaultModel: "claude-sonnet-4-20250514" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4.1-mini" },
  { id: "openai_compatible", label: "兼容接口", defaultModel: "deepseek-chat" },
];

export interface EngineSettingsPaneProps {
  provider: ByokProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  hasByok: boolean;
  onProvider: (next: ByokProvider) => void;
  onApiKey: (next: string) => void;
  onModel: (next: string) => void;
  onBaseUrl: (next: string) => void;
  onClear: () => void;
  onSave: () => void;
}

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

function EndpointInputs(p: {
  provider: ByokProvider;
  model: string;
  baseUrl: string;
  defaultModel: string;
  onModel: (next: string) => void;
  onBaseUrl: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input
        value={p.model}
        maxLength={100}
        onChange={(e) => p.onModel(e.target.value)}
        placeholder={`自定义模型（默认 ${p.defaultModel}）`}
        className="font-mono"
      />
      <Input
        value={p.baseUrl}
        maxLength={240}
        onChange={(e) => p.onBaseUrl(e.target.value)}
        placeholder={
          p.provider === "openai_compatible"
            ? "Base URL（如 https://api.deepseek.com/v1）"
            : "自定义 Base URL（可选，支持 OpenRouter）"
        }
        className="font-mono"
      />
    </div>
  );
}

function CustomOverridePanel(p: EngineSettingsPaneProps) {
  const defaultModel =
    PROVIDERS.find((item) => item.id === p.provider)?.defaultModel ?? "gemini-2.5-flash";
  return (
    <div className="space-y-3.5 rounded-panel border border-hairline bg-muted/35 p-5">
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
      <EndpointInputs
        provider={p.provider}
        model={p.model}
        baseUrl={p.baseUrl}
        defaultModel={defaultModel}
        onModel={p.onModel}
        onBaseUrl={p.onBaseUrl}
      />
      <OverrideFooterBar hasByok={p.hasByok} onClear={p.onClear} onSave={p.onSave} />
    </div>
  );
}

export function EngineSettingsPane(p: EngineSettingsPaneProps) {
  const [showCustom, setShowCustom] = useState(p.hasByok);
  return (
    <div className="space-y-6">
      <div>
        <SettingsSectionLabel>运行状态</SettingsSectionLabel>
        <SettingsCard>
          <SettingsRow
            label="智能投研与一阶分析引擎"
            description="后台统一托管配置，支持流式多角色投委会辩论"
          >
            <Badge variant="pass">{p.hasByok ? "已启用自定义密钥" : "后台已就绪"}</Badge>
          </SettingsRow>
          <SettingsRow
            label="自定义模型与兼容接口（高级）"
            description="支持自定义模型名、OpenRouter / DeepSeek 等 OpenAI 兼容网关"
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
