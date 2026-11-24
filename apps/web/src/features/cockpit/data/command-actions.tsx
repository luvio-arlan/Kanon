import type { GlossaryTerm, ThesisDetail } from "@kanon/core";
import type { CommandActionGroup, CommandActionItem } from "@kanon/ui";
import {
  IconCpu,
  IconDownload,
  IconMoon,
  IconPlus,
  IconSun,
  IconTrendingUp,
} from "@tabler/icons-react";
import { buildGlossaryGroup } from "@/features/glossary";

function buildWorkspaceActionItems(params: {
  theme: "light" | "dark";
  onNewThesis: () => void;
  onOpenAiSettings: () => void;
  onExportCsv: () => void;
  onToggleTheme: () => void;
}): CommandActionItem[] {
  const { theme, onNewThesis, onOpenAiSettings, onExportCsv, onToggleTheme } = params;
  return [
    {
      id: "new-thesis",
      label: "新建美股标的画布",
      description: "开启五步引导研究（滤镜 → 假设 → 财报 → 估值 → 纪律）",
      shortcut: "N",
      icon: <IconPlus size={15} stroke={1.5} />,
      onSelect: onNewThesis,
    },
    {
      id: "ai-settings",
      label: "配置投研副驾驶引擎（BYOK）",
      description: "接入自有 Gemini / Claude / OpenAI 密钥，或使用本地一阶引擎",
      shortcut: "A",
      icon: <IconCpu size={15} stroke={1.5} />,
      onSelect: onOpenAiSettings,
    },
    {
      id: "export-csv",
      label: "导出全仓估值赔率表（Google Sheets CSV）",
      description: "下载含三情景目标价、CAGR 与赔率比的 UTF-8 台账",
      shortcut: "E",
      icon: <IconDownload size={15} stroke={1.5} />,
      onSelect: onExportCsv,
    },
    {
      id: "toggle-theme",
      label: theme === "dark" ? "切换至暖白纸面模式" : "切换至暗夜黑曜石模式",
      description: "在瑞士编辑浅色与阳极钛金属暗色间无缝切换",
      shortcut: "T",
      icon:
        theme === "dark" ? <IconSun size={15} stroke={1.5} /> : <IconMoon size={15} stroke={1.5} />,
      onSelect: onToggleTheme,
    },
  ];
}

export function buildCockpitCommandGroups(params: {
  theses: readonly ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  theme: "light" | "dark";
  onOpenThesis: (thesis: ThesisDetail) => void;
  onNewThesis: () => void;
  onOpenAiSettings: () => void;
  onExportCsv: () => void;
  onToggleTheme: () => void;
}): CommandActionGroup[] {
  return [
    {
      heading: "跟踪标的 · 进入五步画布",
      items: params.theses.map((thesis) => ({
        id: `open-${thesis.id}`,
        label: `${thesis.indexLabel} · ${thesis.companyName} (${thesis.ticker})`,
        description: `${thesis.sectorTag} · 中性目标 $${thesis.valuation.base.targetPrice.toFixed(1)}`,
        shortcut: thesis.ticker,
        keywords: [thesis.ticker, thesis.companyName, thesis.sectorTag],
        icon: <IconTrendingUp size={15} stroke={1.5} />,
        onSelect: () => params.onOpenThesis(thesis),
      })),
    },
    { heading: "研究与导出动作", items: buildWorkspaceActionItems(params) },
    buildGlossaryGroup(params.glossary),
  ];
}
