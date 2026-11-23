"use client";

import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";
import { Badge, Button, cn, KANON_SPRING, KanonMark, useTheme } from "@kanon/ui";
import {
  IconArrowLeft,
  IconCheck,
  IconCpu,
  IconDownload,
  IconMoon,
  IconSearch,
  IconSun,
  IconTrash,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { RailOddsCard, ReadinessMeterCard } from "./canvas-rail-cards";

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: ReadonlyArray<{ id: StepId; code: string; title: string; subtitle: string }> = [
  { id: 1, code: "01", title: "商业模式滤镜", subtitle: "一票否决排除烂生意" },
  { id: 2, code: "02", title: "核心假设拆解", subtitle: "3 条可证伪硬指标" },
  { id: 3, code: "03", title: "一阶资料印证", subtitle: "SEC 原件与上下游对照" },
  { id: 4, code: "04", title: "三情景估值赔率", subtitle: "自主算清安全边际" },
  { id: 5, code: "05", title: "交易纪律与复盘", subtitle: "零杠杆铁律与备忘录复盘" },
];

function ExportArchiveLinks({ thesisId }: { thesisId: string }) {
  return (
    <>
      <a
        href={`/api/export/thesis/${thesisId}?format=md`}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 text-xs font-medium text-ink-secondary shadow-card transition-colors hover:border-strong hover:text-ink-primary"
      >
        <IconDownload size={14} stroke={1.5} />
        <span className="hidden sm:inline">Markdown</span>
      </a>
      <a
        href={`/api/export/thesis/${thesisId}?format=gdoc`}
        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-titanium-subtle px-3 text-xs font-medium text-ink-primary shadow-card transition-colors hover:border-strong"
      >
        <IconDownload size={14} stroke={1.5} />
        <span className="hidden lg:inline">Google Doc</span>
      </a>
    </>
  );
}

function TopbarExportActions({
  thesisId,
  hasByok,
  onOpenCommand,
  onOpenAiSettings,
}: {
  thesisId: string;
  hasByok: boolean;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
}) {
  const { theme, mounted, toggleTheme } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onOpenCommand}
        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-control border border-hairline bg-surface px-2.5 text-xs font-medium text-ink-secondary shadow-card transition-colors hover:border-strong hover:text-ink-primary"
      >
        <IconSearch size={14} stroke={1.5} />
        <kbd className="font-mono text-xs text-ink-muted">⌘K</kbd>
      </button>
      <Button variant="outline" size="sm" onClick={onOpenAiSettings} title="配置大模型引擎">
        <span
          className={`h-1.5 w-1.5 rounded-pill ${hasByok ? "bg-status-pass" : "bg-ink-muted"}`}
        />
        <IconCpu size={14} stroke={1.5} />
        <span className="hidden md:inline">{hasByok ? "BYOK" : "AI 引擎"}</span>
      </Button>
      <ExportArchiveLinks thesisId={thesisId} />
      <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="切换深浅模式">
        {mounted && theme === "dark" ? (
          <IconSun size={15} stroke={1.5} />
        ) : (
          <IconMoon size={15} stroke={1.5} />
        )}
      </Button>
    </div>
  );
}

export function CanvasTopbar({
  thesis,
  hasByok,
  onOpenCommand,
  onOpenAiSettings,
}: {
  thesis: ThesisDetail;
  hasByok: boolean;
  onOpenCommand: () => void;
  onOpenAiSettings: () => void;
}) {
  return (
    <header className="kanon-topbar-glass sticky top-0 z-30 border-b border-hairline">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 sm:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-surface px-2.5 text-xs font-medium text-ink-secondary shadow-card transition-colors hover:border-strong hover:text-ink-primary"
          >
            <IconArrowLeft size={14} stroke={1.5} />
            <span>返回驾驶舱</span>
          </Link>
          <span aria-hidden="true" className="hidden h-4 w-px bg-hairline sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <KanonMark size={16} className="hidden sm:block" />
            <span className="truncate text-sm font-semibold text-ink-primary">
              {thesis.companyName}
            </span>
            <Badge variant="titanium" className="font-mono">
              {thesis.ticker}
            </Badge>
          </div>
        </div>
        <TopbarExportActions
          thesisId={thesis.id}
          hasByok={hasByok}
          onOpenCommand={onOpenCommand}
          onOpenAiSettings={onOpenAiSettings}
        />
      </div>
    </header>
  );
}

function StepRailItem({
  step,
  active,
  complete,
  hint,
  onSelect,
}: {
  step: (typeof STEPS)[number];
  active: boolean;
  complete: boolean;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex w-full cursor-pointer items-start gap-3 rounded-control px-3.5 py-3 text-left transition-colors",
        active ? "text-ink-primary" : "text-ink-secondary hover:bg-muted/60 hover:text-ink-primary",
      )}
    >
      {active ? (
        <motion.span
          layoutId="canvas-step-pill"
          transition={KANON_SPRING}
          className="absolute inset-0 rounded-control border border-hairline bg-surface shadow-card"
        />
      ) : null}
      <span className="relative z-10 mt-0.5 flex items-center gap-1 font-mono text-xs text-ink-muted tabular-nums">
        {complete ? <IconCheck size={13} stroke={1.5} className="text-status-pass" /> : step.code}
      </span>
      <span className="relative z-10 min-w-0">
        <span className="block text-sm font-semibold">{step.title}</span>
        <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>
      </span>
    </button>
  );
}

export function StepRail({
  activeStep,
  thesis,
  onSelect,
  onRequestDelete,
}: {
  activeStep: StepId;
  thesis: ThesisDetail;
  onSelect: (step: StepId) => void;
  onRequestDelete: () => void;
}) {
  const readiness = calculateResearchReadiness(thesis);

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <ReadinessMeterCard completedCount={readiness.completedCount} scorePct={readiness.scorePct} />
      <nav aria-label="五步研究进度" className="space-y-1.5">
        {STEPS.map((step, idx) => (
          <StepRailItem
            key={step.id}
            step={step}
            active={activeStep === step.id}
            complete={Boolean(readiness.steps[idx]?.complete)}
            hint={readiness.steps[idx]?.hint ?? step.subtitle}
            onSelect={() => onSelect(step.id)}
          />
        ))}
      </nav>
      <RailOddsCard thesis={thesis} />
      <button
        type="button"
        onClick={onRequestDelete}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-control border border-hairline px-3 py-2 text-xs text-ink-muted transition-colors hover:border-status-fail/40 hover:bg-status-fail-soft/50 hover:text-status-fail"
      >
        <IconTrash size={14} stroke={1.5} />
        <span>删除此标的档案</span>
      </button>
    </aside>
  );
}
