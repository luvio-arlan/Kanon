"use client";

import {
  MARKET_PROVIDER_LICENSES,
  type MarketProviderPreference,
  type MarketProviderTestResponse,
} from "@kanon/core";
import {
  Badge,
  Button,
  Input,
  MarketSessionBadge,
  SettingsCard,
  SettingsRow,
  SettingsSectionLabel,
} from "@kanon/ui";
import { IconCheck, IconPlugConnected, IconRefresh } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import { readMarketConfig, writeMarketConfig } from "@/shared/lib/client-provider-storage";
import { apiTestMarketProvider } from "../lib/market-storage";

interface ProviderSpec {
  id: MarketProviderPreference;
  label: string;
  tier: string;
  extended: string;
  note: string;
  needsKey: boolean;
}

const PROVIDERS: readonly ProviderSpec[] = [
  {
    id: "auto",
    label: "智能路由（推荐）",
    tier: "商业优先",
    extended: "盘前 / 盘中 / 盘后",
    note: "有付费 Key 时自动优先走商业授权机构源，否则降级至非授权免费 Yahoo 参考源",
    needsKey: false,
  },
  {
    id: "yahoo",
    label: "Yahoo Finance",
    tier: MARKET_PROVIDER_LICENSES.yahoo.badgeLabel,
    extended: "盘前 / 盘中 / 盘后 + 52W",
    note: MARKET_PROVIDER_LICENSES.yahoo.notice,
    needsKey: false,
  },
  {
    id: "finnhub",
    label: "Finnhub",
    tier: MARKET_PROVIDER_LICENSES.finnhub.badgeLabel,
    extended: "美股实时报价",
    note: MARKET_PROVIDER_LICENSES.finnhub.notice,
    needsKey: true,
  },
  {
    id: "fmp",
    label: "Financial Modeling Prep",
    tier: MARKET_PROVIDER_LICENSES.fmp.badgeLabel,
    extended: "盘中 + 盘后逐笔",
    note: MARKET_PROVIDER_LICENSES.fmp.notice,
    needsKey: true,
  },
  {
    id: "polygon",
    label: "Polygon.io (Massive)",
    tier: MARKET_PROVIDER_LICENSES.polygon.badgeLabel,
    extended: "SIP 全时段盘前/盘后",
    note: MARKET_PROVIDER_LICENSES.polygon.notice,
    needsKey: true,
  },
];

function ProviderSelectorGrid({
  selected,
  onSelect,
}: {
  selected: MarketProviderPreference;
  onSelect: (next: MarketProviderPreference) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {PROVIDERS.map((p) => {
        const active = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`cursor-pointer rounded-control border p-3 text-left transition-colors ${
              active
                ? "border-strong bg-surface shadow-pill-active"
                : "border-hairline bg-muted/35 hover:border-strong/60 hover:bg-surface/70"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-primary">{p.label}</span>
              <Badge variant={p.needsKey ? "titanium" : "pass"}>{p.tier}</Badge>
            </div>
            <div className="mt-1 font-mono text-xs text-ink-muted">{p.extended}</div>
            <div className="mt-1 text-xs leading-relaxed text-ink-secondary">{p.note}</div>
          </button>
        );
      })}
    </div>
  );
}

function TestResultStrip({ result }: { result: MarketProviderTestResponse }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline bg-surface px-3.5 py-2.5 text-xs">
      <div className="flex min-w-0 items-center gap-2">
        {result.quote ? <MarketSessionBadge session={result.quote.sessionState} compact /> : null}
        <span className={result.ok ? "font-medium text-ink-primary" : "text-status-fail"}>
          {result.message}
        </span>
      </div>
      <span className="shrink-0 font-mono text-ink-muted tabular-nums">{result.latencyMs}ms</span>
    </div>
  );
}

function MarketKeyCard({
  spec,
  apiKey,
  onApiKey,
}: {
  spec: ProviderSpec | undefined;
  apiKey: string;
  onApiKey: (next: string) => void;
}) {
  return (
    <SettingsCard>
      {spec?.needsKey ? (
        <SettingsRow
          label={`${spec.label} API Key`}
          description="仅保存在当前浏览器本地，请求时透传至服务端网关"
        >
          <Input
            type="password"
            maxLength={128}
            value={apiKey}
            onChange={(e) => onApiKey(e.target.value.slice(0, 128))}
            placeholder="输入付费 Key..."
            className="h-9 w-full font-mono text-xs sm:w-52"
          />
        </SettingsRow>
      ) : null}
      <SettingsRow label="一阶财报原件" description="官方 SEC EDGAR XBRL 10-K / 10-Q 永久免费直连">
        <Badge variant="pass">已内置</Badge>
      </SettingsRow>
    </SettingsCard>
  );
}

function MarketActionsBar(p: {
  testing: boolean;
  onTest: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="outline" size="sm" loading={p.testing} onClick={p.onTest}>
        {!p.testing ? <IconPlugConnected size={15} stroke={1.5} /> : null}
        <span>测试 NVDA 连通性</span>
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={p.onReset}>
          <IconRefresh size={14} stroke={1.5} />
          <span>恢复免费默认</span>
        </Button>
        <Button variant="primary" size="sm" onClick={p.onSave}>
          <IconCheck size={14} stroke={1.5} />
          <span>保存配置</span>
        </Button>
      </div>
    </div>
  );
}

export function MarketSettingsPane({ onChanged }: { onChanged?: () => void }) {
  const initial = readMarketConfig();
  const [provider, setProvider] = useState<MarketProviderPreference>(initial?.provider ?? "auto");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<MarketProviderTestResponse | null>(null);
  const spec = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  const handleSave = () => {
    writeMarketConfig({ provider, apiKey });
    toast.success(`已保存行情数据源：${spec?.label ?? provider}`);
    onChanged?.();
  };
  const handleReset = () => {
    writeMarketConfig(null);
    setProvider("auto");
    setApiKey("");
    setTestResult(null);
    toast.success("已恢复免费内置 Yahoo 盘前/盘后通道");
    onChanged?.();
  };
  const handleTest = async () => {
    setTesting(true);
    const res = await apiTestMarketProvider({
      provider,
      apiKey: apiKey.trim() || undefined,
      ticker: "NVDA",
    }).finally(() => setTesting(false));
    if (res) setTestResult(res);
  };

  return (
    <div className="space-y-5">
      <div>
        <SettingsSectionLabel>行情通道与版本梯度（免费内置 → 付费机构源）</SettingsSectionLabel>
        <ProviderSelectorGrid selected={provider} onSelect={setProvider} />
      </div>
      <MarketKeyCard spec={spec} apiKey={apiKey} onApiKey={setApiKey} />
      {testResult ? <TestResultStrip result={testResult} /> : null}
      <MarketActionsBar
        testing={testing}
        onTest={() => void handleTest()}
        onReset={handleReset}
        onSave={handleSave}
      />
    </div>
  );
}
