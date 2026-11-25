"use client";

import type { ByokProvider, LocalByokConfig, PublicUser } from "@kanon/core";
import { SettingsDialogShell, type SettingsNavTab } from "@kanon/ui";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconDatabaseExport,
  IconPlugConnected,
  IconShieldLock,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readByokConfig, writeByokConfig } from "../lib/byok-storage";
import { AccountSecurityPane } from "./account/account-security-pane";
import { McpTokensPane } from "./account/mcp-tokens-pane";
import { EngineSettingsPane } from "./settings-engine-pane";
import { MarketSettingsPane } from "./settings-market-pane";
import { DataArchivePane, GeneralSettingsPane, type SettingsThesisContext } from "./settings-panes";

export type SettingsTabId = "general" | "market" | "data" | "engine" | "account" | "mcp";

export interface AiSettingsModalProps {
  open: boolean;
  initialTab?: SettingsTabId;
  currentUser?: PublicUser;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  thesisContext?: SettingsThesisContext;
  refreshingPrices?: boolean;
  onRefreshPrices?: () => void;
  onOpenImport?: () => void;
  onRequestDelete?: () => void;
}

const TABS: readonly SettingsNavTab<SettingsTabId>[] = [
  {
    id: "general",
    label: "常规与纪律",
    icon: <IconAdjustmentsHorizontal size={17} stroke={1.5} />,
  },
  { id: "market", label: "行情接口", icon: <IconActivity size={17} stroke={1.5} /> },
  { id: "engine", label: "投研引擎", icon: <IconSparkles size={17} stroke={1.5} /> },
  { id: "mcp", label: "MCP 生态", icon: <IconPlugConnected size={17} stroke={1.5} /> },
  { id: "account", label: "账号安全", icon: <IconShieldLock size={17} stroke={1.5} /> },
  { id: "data", label: "数据与归档", icon: <IconDatabaseExport size={17} stroke={1.5} /> },
];

const TITLES: Record<SettingsTabId, string> = {
  general: "常规与投研纪律",
  market: "实时盘前/盘后行情接口",
  engine: "智能投研引擎与自定义模型",
  mcp: "标准 MCP Server 与访问令牌",
  account: "账号身份与设备安全",
  data: "数据导入与归档",
};

function buildByokDraft(
  provider: ByokProvider,
  apiKey: string,
  model: string,
  baseUrl: string,
): LocalByokConfig | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return null;
  return {
    provider,
    apiKey: trimmed,
    ...(model.trim() ? { model: model.trim() } : {}),
    ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
  };
}

function readInitialDraft() {
  const saved = readByokConfig();
  return {
    hasByok: Boolean(saved),
    provider: (saved?.provider ?? "gemini") as ByokProvider,
    apiKey: saved?.apiKey ?? "",
    model: saved?.model ?? "",
    baseUrl: saved?.baseUrl ?? "",
  };
}

function useByokModalState(
  open: boolean,
  initialTab: SettingsTabId | undefined,
  onChanged?: () => void,
) {
  const [tab, setTab] = useState<SettingsTabId>(initialTab ?? "general");
  const [draft, setDraft] = useState({
    provider: "gemini" as ByokProvider,
    apiKey: "",
    model: "",
    baseUrl: "",
  });
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTab) setTab(initialTab);
    const { hasByok: active, ...rest } = readInitialDraft();
    setHasByok(active);
    setDraft(rest);
  }, [open, initialTab]);

  function commit(next: LocalByokConfig | null, msg: string) {
    writeByokConfig(next);
    setHasByok(Boolean(next));
    if (!next) setDraft((prev) => ({ ...prev, apiKey: "", model: "", baseUrl: "" }));
    toast.success(msg);
    onChanged?.();
  }

  return {
    tab,
    setTab,
    ...draft,
    hasByok,
    setField: <K extends keyof typeof draft>(key: K, val: (typeof draft)[K]) =>
      setDraft((p) => ({ ...p, [key]: val })),
    clear: () => commit(null, "已恢复后台托管默认引擎"),
    save: () => {
      const next = buildByokDraft(draft.provider, draft.apiKey, draft.model, draft.baseUrl);
      commit(
        next,
        next ? `已启用个人 ${draft.provider.toUpperCase()} 引擎` : "已恢复后台托管默认引擎",
      );
    },
  };
}

function SettingsTabBody(p: {
  props: AiSettingsModalProps;
  byok: ReturnType<typeof useByokModalState>;
}) {
  const { props, byok } = p;
  if (byok.tab === "general") {
    return (
      <GeneralSettingsPane
        refreshingPrices={props.refreshingPrices}
        onRefreshPrices={props.onRefreshPrices}
      />
    );
  }
  if (byok.tab === "market") return <MarketSettingsPane onChanged={props.onChanged} />;
  if (byok.tab === "account") return <AccountSecurityPane currentUser={props.currentUser} />;
  if (byok.tab === "mcp") return <McpTokensPane />;
  if (byok.tab === "data") {
    return (
      <DataArchivePane
        thesis={props.thesisContext}
        onOpenImport={props.onOpenImport}
        onRequestDelete={props.onRequestDelete}
        onClose={() => props.onOpenChange(false)}
      />
    );
  }
  return (
    <EngineSettingsPane
      provider={byok.provider}
      apiKey={byok.apiKey}
      model={byok.model}
      baseUrl={byok.baseUrl}
      hasByok={byok.hasByok}
      onProvider={(v) => byok.setField("provider", v)}
      onApiKey={(v) => byok.setField("apiKey", v)}
      onModel={(v) => byok.setField("model", v)}
      onBaseUrl={(v) => byok.setField("baseUrl", v)}
      onClear={byok.clear}
      onSave={byok.save}
    />
  );
}

export function AiSettingsModal(props: AiSettingsModalProps) {
  const byok = useByokModalState(props.open, props.initialTab, props.onChanged);
  return (
    <SettingsDialogShell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={TITLES[byok.tab]}
      tabs={TABS}
      activeTab={byok.tab}
      onSelectTab={byok.setTab}
    >
      <SettingsTabBody props={props} byok={byok} />
    </SettingsDialogShell>
  );
}
