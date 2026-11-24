import type { GlossaryTerm, ThesisDetail } from "@kanon/core";
import type { CommandActionGroup, CommandActionItem } from "@kanon/ui";
import {
  IconActivityHeartbeat,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
  IconTrendingUp,
} from "@tabler/icons-react";
import { buildGlossaryGroup } from "@/features/glossary";

function buildWorkspaceActionItems(params: {
  theme: "light" | "dark";
  onNewThesis: () => void;
  onOpenSettings: () => void;
  onOpenStressTest?: () => void;
  onToggleTheme: () => void;
}): CommandActionItem[] {
  const { theme, onNewThesis, onOpenSettings, onOpenStressTest, onToggleTheme } = params;
  return [
    {
      id: "new-thesis",
      label: "新建研究标的",
      description: "五步画布",
      shortcut: "N",
      icon: <IconPlus size={16} stroke={1.5} />,
      onSelect: onNewThesis,
    },
    ...(onOpenStressTest
      ? [
          {
            id: "stress-test",
            label: "组合压力测试",
            description: "风险纪律",
            icon: <IconActivityHeartbeat size={16} stroke={1.5} />,
            onSelect: onOpenStressTest,
          },
        ]
      : []),
    {
      id: "open-settings",
      label: "工作台设置",
      description: "数据与偏好",
      shortcut: ",",
      icon: <IconSettings size={16} stroke={1.5} />,
      onSelect: onOpenSettings,
    },
    {
      id: "toggle-theme",
      label: theme === "dark" ? "切换至浅色纸面" : "切换至暗夜黑曜石",
      shortcut: "T",
      icon:
        theme === "dark" ? <IconSun size={16} stroke={1.5} /> : <IconMoon size={16} stroke={1.5} />,
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
  onOpenSettings: () => void;
  onOpenStressTest?: () => void;
  onToggleTheme: () => void;
}): CommandActionGroup[] {
  const groups: CommandActionGroup[] = [];
  if (params.theses.length > 0) {
    groups.push({
      heading: "研究档案",
      items: params.theses.map((thesis) => ({
        id: `open-${thesis.id}`,
        label: `${thesis.companyName}`,
        description: `目标 $${thesis.valuation.base.targetPrice.toFixed(1)}`,
        shortcut: thesis.ticker,
        keywords: [thesis.ticker, thesis.companyName, thesis.sectorTag],
        icon: <IconTrendingUp size={16} stroke={1.5} />,
        onSelect: () => params.onOpenThesis(thesis),
      })),
    });
  }
  groups.push({ heading: "快捷操作", items: buildWorkspaceActionItems(params) });
  groups.push(buildGlossaryGroup(params.glossary));
  return groups;
}
