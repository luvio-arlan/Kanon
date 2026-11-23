import type { GlossaryTerm, ThesisDetail } from "@kanon/core";
import type { CommandActionGroup, CommandActionItem } from "@kanon/ui";
import {
  IconArrowLeft,
  IconCpu,
  IconDownload,
  IconFileText,
  IconFlame,
  IconFocus2,
  IconListCheck,
  IconMoon,
  IconSparkles,
  IconSun,
  IconTrendingUp,
} from "@tabler/icons-react";
import { buildGlossaryGroup } from "@/features/glossary";
import type { StepId } from "../components/canvas-chrome";

const STEP_COMMANDS: ReadonlyArray<{ id: StepId; label: string; desc: string }> = [
  { id: 1, label: "Step 01 · 商业模式滤镜", desc: "评估复购、定价权、ROIC 与历史财务基本盘" },
  { id: 2, label: "Step 02 · 核心假设拆解", desc: "编写 3 条可证伪硬指标并触发红队拷问" },
  { id: 3, label: "Step 03 · 一阶资料印证", desc: "同步 SEC 多年度数据、精读电话会与上下游对照" },
  { id: 4, label: "Step 04 · 三情景估值赔率", desc: "调整 EPS/PE 滑块与 5×5 敏感度矩阵" },
  { id: 5, label: "Step 05 · 交易纪律与复盘", desc: "零杠杆检查单、决策留痕与一页纸备忘录" },
];

export interface CanvasCommandParams {
  currentThesis: ThesisDetail;
  allTheses: readonly ThesisDetail[];
  glossary: readonly GlossaryTerm[];
  theme: "light" | "dark";
  onSelectStep: (step: StepId) => void;
  onSwitchThesis: (thesisId: string) => void;
  onGoHome: () => void;
  onRunRedTeam: () => void;
  onRunDigest: () => void;
  onRunMemo: () => void;
  onOpenAiSettings: () => void;
  onToggleFocus: () => void;
  onExportMd: () => void;
  onExportGdoc: () => void;
  onToggleTheme: () => void;
}

function buildCopilotItems(p: CanvasCommandParams): CommandActionItem[] {
  return [
    {
      id: "run-red-team",
      label: "启动「魔鬼代言人」红队拷问",
      description: "自动跳转至 Step 2 并针对 3 条核心假设寻找致命证伪路径",
      shortcut: "R",
      icon: <IconFlame size={15} stroke={1.5} />,
      onSelect: p.onRunRedTeam,
    },
    {
      id: "run-digest",
      label: "提炼季度电话会与供给信号",
      description: "自动跳转至 Step 3 并基于一阶档案提炼 CapEx 与管理层措辞变化",
      shortcut: "D",
      icon: <IconSparkles size={15} stroke={1.5} />,
      onSelect: p.onRunDigest,
    },
    {
      id: "run-memo",
      label: "生成一页纸投研备忘录（Investment Memo）",
      description: "汇总 5 步研究逻辑、估值区间与核心风险为投委会级复盘文档",
      shortcut: "M",
      icon: <IconFileText size={15} stroke={1.5} />,
      onSelect: p.onRunMemo,
    },
    {
      id: "open-byok",
      label: "配置投研副驾驶引擎（BYOK）",
      description: "切换自有 Gemini / Claude / OpenAI 密钥或本地确定性引擎",
      shortcut: "A",
      icon: <IconCpu size={15} stroke={1.5} />,
      onSelect: p.onOpenAiSettings,
    },
  ];
}

function buildArchiveItems(p: CanvasCommandParams): CommandActionItem[] {
  return [
    {
      id: "export-md",
      label: "导出完整研究档案（Markdown）",
      description: "下载结构化 .md 归档文件用于本地知识库沉淀",
      icon: <IconDownload size={15} stroke={1.5} />,
      onSelect: p.onExportMd,
    },
    {
      id: "export-gdoc",
      label: "导出完整研究档案（Google Doc HTML）",
      description: "下载可直接导入 Google Docs 的排版档案",
      icon: <IconDownload size={15} stroke={1.5} />,
      onSelect: p.onExportGdoc,
    },
    {
      id: "toggle-focus",
      label: "切换专注阅读模式",
      description: "隐藏左侧导轨并居中为 768px 出版级专注视野",
      shortcut: "F",
      icon: <IconFocus2 size={15} stroke={1.5} />,
      onSelect: p.onToggleFocus,
    },
    {
      id: "toggle-theme",
      label: p.theme === "dark" ? "切换至暖白纸面模式" : "切换至暗夜黑曜石模式",
      description: "实时切换瑞士编辑浅色与阳极钛金属暗色主题",
      shortcut: "T",
      icon:
        p.theme === "dark" ? (
          <IconSun size={15} stroke={1.5} />
        ) : (
          <IconMoon size={15} stroke={1.5} />
        ),
      onSelect: p.onToggleTheme,
    },
    {
      id: "go-home",
      label: "返回驾驶舱总览",
      description: "查看全仓标的 Bento 卡片与赔率对比矩阵",
      shortcut: "H",
      icon: <IconArrowLeft size={15} stroke={1.5} />,
      onSelect: p.onGoHome,
    },
  ];
}

export function buildCanvasCommandGroups(p: CanvasCommandParams): CommandActionGroup[] {
  const siblings = p.allTheses.filter((item) => item.id !== p.currentThesis.id);
  const groups: CommandActionGroup[] = [
    {
      heading: `当前画布 · ${p.currentThesis.ticker}`,
      items: STEP_COMMANDS.map((step) => ({
        id: `step-${step.id}`,
        label: step.label,
        description: step.desc,
        shortcut: String(step.id),
        icon: <IconListCheck size={15} stroke={1.5} />,
        onSelect: () => p.onSelectStep(step.id),
      })),
    },
    { heading: "副驾驶、导出与工作台", items: [...buildCopilotItems(p), ...buildArchiveItems(p)] },
  ];

  if (siblings.length > 0) {
    groups.push({
      heading: "切换其他跟踪标的",
      items: siblings.map((item) => ({
        id: `switch-${item.id}`,
        label: `${item.indexLabel} · ${item.companyName} (${item.ticker})`,
        description: `${item.sectorTag} · 中性目标 $${item.valuation.base.targetPrice.toFixed(1)}`,
        shortcut: item.ticker,
        keywords: [item.ticker, item.companyName, item.sectorTag],
        icon: <IconTrendingUp size={15} stroke={1.5} />,
        onSelect: () => p.onSwitchThesis(item.id),
      })),
    });
  }

  groups.push(buildGlossaryGroup(p.glossary));
  return groups;
}
