"use client";

import { calculateResearchReadiness, type ThesisDetail } from "@kanon/core";
import { cn, KANON_TRANSITION_FAST } from "@kanon/ui";
import { IconArrowRight, IconCheck, IconPlus, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

export interface OnboardingGuideCardProps {
  open: boolean;
  theses: readonly ThesisDetail[];
  onDismiss: () => void;
  onNewThesis: () => void;
}

const FLOW_STEPS = ["01 滤镜", "02 假设", "03 财报", "04 估值", "05 纪律"] as const;

interface GuideStepSpec {
  code: string;
  title: string;
  caption: string;
  done: boolean;
  href?: string;
  actionLabel: string;
  onAction?: () => void;
}

function buildCanvasStep(
  primary: ThesisDetail | null,
  nextStep: ReturnType<typeof calculateResearchReadiness>["steps"][number] | null,
  maxCompleted: number,
  onNewThesis: () => void,
): GuideStepSpec {
  const caption =
    primary && nextStep
      ? `${primary.ticker} 待完成：${nextStep.label}`
      : primary
        ? `${primary.ticker} 已完成全部五步`
        : "依次筛除烂生意并写清核心假设";
  return {
    code: "02",
    title: "完成五步研究画布",
    caption,
    done: maxCompleted >= 4,
    href: primary ? `/thesis/${primary.id}?step=${nextStep?.step ?? 1}` : undefined,
    actionLabel: nextStep ? `去第 ${nextStep.step} 步` : "进入画布",
    onAction: primary ? undefined : onNewThesis,
  };
}

function buildDisciplineStep(
  primary: ThesisDetail | null,
  step4Done: boolean,
  maxCompleted: number,
  onNewThesis: () => void,
): GuideStepSpec {
  return {
    code: "03",
    title: "锚定买点与纪律红线",
    caption: maxCompleted >= 5 ? "已建立估值赔率与交易纪律" : "算清三年赔率并签下离场规则",
    done: maxCompleted >= 5,
    href: primary ? `/thesis/${primary.id}?step=${step4Done ? 5 : 4}` : undefined,
    actionLabel: step4Done ? "签写纪律" : "去算赔率",
    onAction: primary ? undefined : onNewThesis,
  };
}

function deriveGuideSteps(
  theses: readonly ThesisDetail[],
  onNewThesis: () => void,
): GuideStepSpec[] {
  const active = theses.filter((t) => t.status !== "archived_veto");
  const primary = active[0] ?? null;
  const readiness = primary ? calculateResearchReadiness(primary) : null;
  const nextStep = readiness?.steps.find((s) => !s.complete) ?? null;
  const maxCompleted = active.reduce(
    (best, item) => Math.max(best, calculateResearchReadiness(item).completedCount),
    0,
  );
  const step1: GuideStepSpec = {
    code: "01",
    title: "选定研究标的",
    caption: primary ? `已跟踪 ${primary.ticker} 等 ${active.length} 只` : "添加第一家熟悉的公司",
    done: active.length > 0,
    actionLabel: primary ? "添加更多" : "新建标的",
    onAction: onNewThesis,
  };
  return [
    step1,
    buildCanvasStep(primary, nextStep, maxCompleted, onNewThesis),
    buildDisciplineStep(primary, Boolean(readiness?.steps[3]?.complete), maxCompleted, onNewThesis),
  ];
}

function GuideStepTile({ item }: { item: GuideStepSpec }) {
  const rowClass = cn(
    "group flex items-center justify-between gap-3 rounded-control border px-3.5 py-3 text-left transition-colors",
    item.done
      ? "border-hairline bg-muted/35 text-ink-secondary hover:border-strong"
      : "border-hairline bg-canvas/70 text-ink-primary hover:border-strong hover:bg-muted/45",
  );
  const inner = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {item.done ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-pill bg-status-pass-soft text-status-pass">
              <IconCheck size={11} stroke={1.5} />
            </span>
          ) : (
            <span className="font-mono text-xs font-medium text-accent-coral tabular-nums">
              {item.code}
            </span>
          )}
          <span className="truncate text-sm font-medium text-ink-primary">{item.title}</span>
        </div>
        <div className="mt-1 truncate text-xs text-ink-muted">{item.caption}</div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-ink-secondary transition-colors group-hover:text-ink-primary">
        <span>{item.actionLabel}</span>
        <IconArrowRight
          size={13}
          stroke={1.5}
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={rowClass}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={item.onAction} className={cn(rowClass, "w-full cursor-pointer")}>
      {inner}
    </button>
  );
}

function GuideHeader({ doneCount, onDismiss }: { doneCount: number; onDismiss: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="rounded-pill bg-accent-coral-soft px-2.5 py-0.5 text-xs font-medium text-accent-coral">
          新手引导
        </span>
        <span className="text-sm font-medium text-ink-primary">三步跑通 KANON 投研链路</span>
        <span className="hidden items-center gap-1.5 font-mono text-xs text-ink-muted lg:inline-flex">
          {FLOW_STEPS.map((label, idx) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              {idx > 0 ? <span aria-hidden="true">→</span> : null}
              <span>{label}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs text-ink-muted tabular-nums">{doneCount}/3</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="收起新手引导"
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary"
        >
          <IconX size={14} stroke={1.5} />
        </button>
      </div>
    </div>
  );
}

export function OnboardingGuideCard(props: OnboardingGuideCardProps) {
  const steps = deriveGuideSteps(props.theses, props.onNewThesis);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <AnimatePresence initial={false}>
      {props.open ? (
        <motion.section
          key="onboarding-guide"
          aria-label="新手引导"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={KANON_TRANSITION_FAST}
          className="mb-6 overflow-hidden"
        >
          <div className="rounded-card border border-hairline bg-surface p-5 shadow-card">
            <GuideHeader doneCount={doneCount} onDismiss={props.onDismiss} />
            <div className="mt-3.5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {steps.map((item) => (
                <GuideStepTile key={item.code} item={item} />
              ))}
            </div>
            {props.theses.length === 0 ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={props.onNewThesis}
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-accent-coral hover:opacity-80"
                >
                  <IconPlus size={13} stroke={1.5} />
                  <span>立即创建第一只研究标的</span>
                </button>
              </div>
            ) : null}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
