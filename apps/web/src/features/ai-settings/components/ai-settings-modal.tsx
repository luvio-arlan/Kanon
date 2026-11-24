"use client";

import type { ByokProvider } from "@kanon/ai";
import { SettingsDialogShell, type SettingsNavTab } from "@kanon/ui";
import {
  IconActivity,
  IconAdjustmentsHorizontal,
  IconDatabaseExport,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readByokConfig, writeByokConfig } from "../lib/byok-storage";
import { EngineSettingsPane } from "./settings-engine-pane";
import { MarketSettingsPane } from "./settings-market-pane";
import { DataArchivePane, GeneralSettingsPane, type SettingsThesisContext } from "./settings-panes";

type SettingsTabId = "general" | "market" | "data" | "engine";

export interface AiSettingsModalProps {
  open: boolean;
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
  { id: "data", label: "数据与归档", icon: <IconDatabaseExport size={17} stroke={1.5} /> },
  { id: "engine", label: "投研引擎", icon: <IconSparkles size={17} stroke={1.5} /> },
];

const TITLES: Record<SettingsTabId, string> = {
  general: "常规与投研纪律",
  market: "实时盘前/盘后行情接口",
  data: "数据导入与归档",
  engine: "智能投研引擎",
};

function SettingsTabBody(p: {
  tab: SettingsTabId;
  props: AiSettingsModalProps;
  provider: ByokProvider;
  apiKey: string;
  hasByok: boolean;
  onProvider: (next: ByokProvider) => void;
  onApiKey: (next: string) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  if (p.tab === "general") {
    return (
      <GeneralSettingsPane
        refreshingPrices={p.props.refreshingPrices}
        onRefreshPrices={p.props.onRefreshPrices}
      />
    );
  }
  if (p.tab === "market") {
    return <MarketSettingsPane onChanged={p.props.onChanged} />;
  }
  if (p.tab === "data") {
    return (
      <DataArchivePane
        thesis={p.props.thesisContext}
        onOpenImport={p.props.onOpenImport}
        onRequestDelete={p.props.onRequestDelete}
        onClose={() => p.props.onOpenChange(false)}
      />
    );
  }
  return (
    <EngineSettingsPane
      provider={p.provider}
      apiKey={p.apiKey}
      hasByok={p.hasByok}
      onProvider={p.onProvider}
      onApiKey={p.onApiKey}
      onClear={p.onClear}
      onSave={p.onSave}
    />
  );
}

function useByokModalState(open: boolean, onChanged?: () => void) {
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [hasByok, setHasByok] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = readByokConfig();
    setHasByok(Boolean(saved));
    setProvider(saved?.provider ?? "gemini");
    setApiKey(saved?.apiKey ?? "");
  }, [open]);

  function commit(next: { provider: ByokProvider; apiKey: string } | null, msg: string) {
    writeByokConfig(next);
    setHasByok(Boolean(next));
    if (!next) setApiKey("");
    toast.success(msg);
    onChanged?.();
  }

  return {
    provider,
    setProvider,
    apiKey,
    setApiKey,
    hasByok,
    clear: () => commit(null, "已恢复后台托管默认引擎"),
    save: () => {
      const trimmed = apiKey.trim();
      if (trimmed)
        commit({ provider, apiKey: trimmed }, `已启用个人 ${provider.toUpperCase()} 引擎`);
      else commit(null, "已恢复后台托管默认引擎");
    },
  };
}

export function AiSettingsModal(props: AiSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTabId>("general");
  const byok = useByokModalState(props.open, props.onChanged);

  return (
    <SettingsDialogShell
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={TITLES[tab]}
      tabs={TABS}
      activeTab={tab}
      onSelectTab={setTab}
    >
      <SettingsTabBody
        tab={tab}
        props={props}
        provider={byok.provider}
        apiKey={byok.apiKey}
        hasByok={byok.hasByok}
        onProvider={byok.setProvider}
        onApiKey={byok.setApiKey}
        onClear={byok.clear}
        onSave={byok.save}
      />
    </SettingsDialogShell>
  );
}
