import type { GlossaryTerm, ThesisDetail, ThesisSummary } from "@kanon/core";
import type { CommandActionGroup, CommandActionItem } from "@kanon/ui";
import {
  IconArrowLeft,
  IconFileText,
  IconFlame,
  IconFocus2,
  IconListCheck,
  IconMoon,
  IconSettings,
  IconSparkles,
  IconSun,
  IconTrendingUp,
} from "@tabler/icons-react";
import { buildGlossaryGroup } from "@/features/glossary";
import type { StepId } from "../components/canvas-chrome";

const STEP_COMMANDS: ReadonlyArray<{ id: StepId; label: string; hint: string }> = [
  { id: 1, label: "01 · 商业质量评估", hint: "初筛" },
  { id: 2, label: "02 · 核心假设拆解", hint: "阈值" },
  { id: 3, label: "03 · 一阶资料印证", hint: "财报" },
  { id: 4, label: "04 · 三情景估值赔率", hint: "估值" },
  { id: 5, label: "05 · 纪律与备忘录", hint: "复盘" },
];

export interface CanvasCommandParams {
  currentThesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
  glossary: readonly GlossaryTerm[];
  theme: "light" | "dark";
  onSelectStep: (step: StepId) => void;
  onSwitchThesis: (thesisId: string) => void;
  onGoHome: () => void;
  onOpenAgent: () => void;
  onRunRedTeam: () => void;
  onRunDigest: () => void;
  onRunMemo: () => void;
  onOpenSettings: () => void;
  onToggleFocus: () => void;
  onToggleTheme: () => void;
}

function buildCopilotActions(p: CanvasCommandParams): CommandActionItem[] {
  return [
    {
      id: "open-agent",
      label: "打开投研 Agent",
      description: "深度审计",
      shortcut: "⌘J",
      icon: <IconSparkles size={16} stroke={1.5} />,
      onSelect: p.onOpenAgent,
    },
    {
      id: "run-red-team",
      label: "启动空头反向质询",
      description: "Step 02",
      shortcut: "R",
      icon: <IconFlame size={16} stroke={1.5} />,
      onSelect: p.onRunRedTeam,
    },
    {
      id: "run-digest",
      label: "提炼电话会要点",
      description: "Step 03",
      shortcut: "D",
      icon: <IconSparkles size={16} stroke={1.5} />,
      onSelect: p.onRunDigest,
    },
    {
      id: "run-memo",
      label: "生成一页纸备忘录",
      description: "Step 05",
      shortcut: "M",
      icon: <IconFileText size={16} stroke={1.5} />,
      onSelect: p.onRunMemo,
    },
  ];
}

function buildWorkspaceActions(p: CanvasCommandParams): CommandActionItem[] {
  const themeIcon =
    p.theme === "dark" ? <IconSun size={16} stroke={1.5} /> : <IconMoon size={16} stroke={1.5} />;
  return [
    {
      id: "toggle-focus",
      label: "切换专注阅读模式",
      shortcut: "F",
      icon: <IconFocus2 size={16} stroke={1.5} />,
      onSelect: p.onToggleFocus,
    },
    {
      id: "open-settings",
      label: "工作台设置与归档",
      icon: <IconSettings size={16} stroke={1.5} />,
      onSelect: p.onOpenSettings,
    },
    {
      id: "toggle-theme",
      label: p.theme === "dark" ? "切换浅色纸面" : "切换暗夜黑曜石",
      shortcut: "T",
      icon: themeIcon,
      onSelect: p.onToggleTheme,
    },
    {
      id: "go-home",
      label: "返回研究工作台",
      shortcut: "H",
      icon: <IconArrowLeft size={16} stroke={1.5} />,
      onSelect: p.onGoHome,
    },
  ];
}

export function buildCanvasCommandGroups(p: CanvasCommandParams): CommandActionGroup[] {
  const siblings = p.allTheses.filter((item) => item.id !== p.currentThesis.id);
  const groups: CommandActionGroup[] = [
    {
      heading: `${p.currentThesis.companyName} · 步骤跳转`,
      items: STEP_COMMANDS.map((step) => ({
        id: `step-${step.id}`,
        label: step.label,
        description: step.hint,
        shortcut: String(step.id),
        icon: <IconListCheck size={16} stroke={1.5} />,
        onSelect: () => p.onSelectStep(step.id),
      })),
    },
    { heading: "研究与视图", items: [...buildCopilotActions(p), ...buildWorkspaceActions(p)] },
  ];

  if (siblings.length > 0) {
    groups.push({
      heading: "切换研究标的",
      items: siblings.map((item) => ({
        id: `switch-${item.id}`,
        label: item.companyName,
        description: `$${item.baseTargetPrice.toFixed(1)}`,
        shortcut: item.ticker,
        keywords: [item.ticker, item.companyName, item.sectorTag],
        icon: <IconTrendingUp size={16} stroke={1.5} />,
        onSelect: () => p.onSwitchThesis(item.id),
      })),
    });
  }

  groups.push(buildGlossaryGroup(p.glossary));
  return groups;
}
