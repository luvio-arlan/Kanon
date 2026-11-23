"use client";

import type { ThesisDetail } from "@kanon/core";
import { Badge, Button, cn, KANON_SPRING, KanonMark, useTheme } from "@kanon/ui";
import { IconArrowLeft, IconDownload, IconMoon, IconSun } from "@tabler/icons-react";
import { motion } from "framer-motion";
import Link from "next/link";

export type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: ReadonlyArray<{ id: StepId; code: string; title: string; subtitle: string }> = [
  { id: 1, code: "01", title: "商业模式滤镜", subtitle: "一票否决排除烂生意" },
  { id: 2, code: "02", title: "核心假设拆解", subtitle: "3 条可证伪硬指标" },
  { id: 3, code: "03", title: "一阶资料印证", subtitle: "SEC 原件与上下游对照" },
  { id: 4, code: "04", title: "三情景估值赔率", subtitle: "自主算清安全边际" },
  { id: 5, code: "05", title: "交易纪律与复盘", subtitle: "零杠杆铁律与口播沉淀" },
];

function TopbarExportActions({ thesisId }: { thesisId: string }) {
  const { theme, mounted, toggleTheme } = useTheme();
  return (
    <div className="flex items-center gap-2">
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
        <span className="hidden sm:inline">Google Doc</span>
      </a>
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

export function CanvasTopbar({ thesis }: { thesis: ThesisDetail }) {
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
        <TopbarExportActions thesisId={thesis.id} />
      </div>
    </header>
  );
}

function RailOddsCard({ thesis }: { thesis: ThesisDetail }) {
  const ratio =
    thesis.valuation.riskRewardRatio !== null
      ? `${thesis.valuation.riskRewardRatio.toFixed(2)}×`
      : "∞";

  return (
    <div className="rounded-card border border-hairline bg-titanium-subtle p-4 shadow-card">
      <div className="text-xs text-ink-muted">实时赔率锚点</div>
      <div className="mt-1.5 flex items-baseline justify-between font-mono tabular-nums">
        <span className="text-2xl font-semibold text-ink-primary">
          ${thesis.valuation.base.targetPrice.toFixed(1)}
        </span>
        <span className="text-xs font-medium text-status-pass">赔率 {ratio}</span>
      </div>
      <div className="mt-1 text-xs text-ink-secondary tabular-nums">
        现价 ${thesis.currentPrice.toFixed(2)} · 年化 {thesis.valuation.base.cagrPct.toFixed(1)}%
      </div>
    </div>
  );
}

export function StepRail({
  activeStep,
  thesis,
  onSelect,
}: {
  activeStep: StepId;
  thesis: ThesisDetail;
  onSelect: (step: StepId) => void;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <nav aria-label="五步研究进度" className="space-y-1.5">
        {STEPS.map((step) => {
          const active = activeStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onSelect(step.id)}
              className={cn(
                "relative flex w-full cursor-pointer items-start gap-3 rounded-control px-3.5 py-3 text-left transition-colors",
                active
                  ? "text-ink-primary"
                  : "text-ink-secondary hover:bg-muted/60 hover:text-ink-primary",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="canvas-step-pill"
                  transition={KANON_SPRING}
                  className="absolute inset-0 rounded-control border border-hairline bg-surface shadow-card"
                />
              ) : null}
              <span className="relative z-10 mt-0.5 font-mono text-xs text-ink-muted tabular-nums">
                {step.code}
              </span>
              <span className="relative z-10 min-w-0">
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{step.subtitle}</span>
              </span>
            </button>
          );
        })}
      </nav>
      <RailOddsCard thesis={thesis} />
    </aside>
  );
}
