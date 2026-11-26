"use client";

import type { ThesisDetail, ThesisSummary } from "@kanon/core";
import { Button, cn, KanonMark, Kbd, SidebarThemeSwitch } from "@kanon/ui";
import {
  IconArrowLeft,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconSparkles,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { resolveCockpitHref } from "@/shared/lib/cockpit-return";
import { CompanySwitcherTile, ResearchUtilityBar } from "./research-sidebar-parts";
import { type StepId, StepRail } from "./step-rail";

export { type StepId, StepRail };

export function buildMobileChrome(thesis: ThesisDetail, onOpenAgent: () => void) {
  return {
    title: (
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="truncate text-base font-semibold text-ink-primary">
          {thesis.companyName}
        </span>
        <span className="font-mono text-xs text-ink-muted">{thesis.ticker}</span>
      </span>
    ),
    actions: (
      <Button variant="primary" size="sm" onClick={onOpenAgent}>
        <IconSparkles size={15} stroke={1.5} className="text-accent-coral" />
        <span>Agent</span>
      </Button>
    ),
  };
}

export interface ResearchSidebarProps {
  thesis: ThesisDetail;
  allTheses: readonly ThesisSummary[];
  activeStep: StepId;
  collapsed: boolean;
  isMobile?: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
  onBeforeSwitch?: () => Promise<void>;
  onSelectStep: (step: StepId) => void;
  onOpenAgent: () => void;
  onOpenCommand: () => void;
  onOpenSettings: () => void;
  onToggleFocus: () => void;
}

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function SidebarTopHeader(p: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onBeforeLeave?: () => Promise<void>;
}) {
  const router = useRouter();
  const handleHomeClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(event)) return;
    event.preventDefault();
    const href = resolveCockpitHref();
    const leave = p.onBeforeLeave ? p.onBeforeLeave() : Promise.resolve();
    void leave.finally(() => router.push(href));
  };
  return (
    <div
      className={cn(
        "flex items-center px-3 pb-2 pt-3.5",
        p.collapsed ? "flex-col gap-2.5 px-2" : "justify-between",
      )}
    >
      <Link
        href="/"
        onClick={handleHomeClick}
        title="返回研究工作台"
        aria-label="返回研究工作台"
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <IconArrowLeft size={16} stroke={1.5} />
        {!p.collapsed ? (
          <>
            <KanonMark size={16} accent />
            <span>工作台</span>
          </>
        ) : null}
      </Link>
      <button
        type="button"
        onClick={p.onToggleCollapse}
        aria-label={p.collapsed ? "展开侧栏" : "收起侧栏"}
        className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary lg:flex"
      >
        {p.collapsed ? (
          <IconLayoutSidebarLeftExpand size={17} stroke={1.5} />
        ) : (
          <IconLayoutSidebarLeftCollapse size={17} stroke={1.5} />
        )}
      </button>
    </div>
  );
}

function SidebarBottomFooter(p: ResearchSidebarProps) {
  return (
    <div
      className={cn(
        "shrink-0 space-y-2.5 border-t border-hairline py-3",
        p.collapsed ? "flex flex-col items-center px-2" : "px-3",
      )}
    >
      <Button
        variant="primary"
        size="md"
        onClick={() => {
          p.onCloseMobile();
          p.onOpenAgent();
        }}
        aria-label="打开投研 Agent"
        className={p.collapsed ? "h-10 w-10 px-0" : "w-full justify-between px-3.5"}
      >
        <span className="inline-flex items-center gap-2">
          <IconSparkles size={16} stroke={1.5} className="text-accent-coral" />
          {!p.collapsed ? <span>投研 Agent</span> : null}
        </span>
        {!p.collapsed ? (
          <Kbd className="border-ink-inverse/20 bg-transparent text-ink-inverse/80">⌘J</Kbd>
        ) : null}
      </Button>
      {!p.collapsed ? (
        <ResearchUtilityBar
          onOpenCommand={p.onOpenCommand}
          onToggleFocus={p.onToggleFocus}
          onOpenSettings={p.onOpenSettings}
        />
      ) : null}
      <SidebarThemeSwitch collapsed={p.collapsed} />
    </div>
  );
}

export function ResearchSidebar(props: ResearchSidebarProps) {
  return (
    <div className="flex h-full flex-col justify-between overflow-hidden">
      <div className="kanon-scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pb-2">
        <SidebarTopHeader
          collapsed={props.collapsed}
          onToggleCollapse={props.onToggleCollapse}
          onBeforeLeave={props.onBeforeSwitch}
        />
        <CompanySwitcherTile
          thesis={props.thesis}
          allTheses={props.allTheses}
          collapsed={props.collapsed}
          onBeforeSwitch={props.onBeforeSwitch}
        />
        <div className={props.collapsed ? "px-2" : "px-3"}>
          <StepRail
            activeStep={props.activeStep}
            thesis={props.thesis}
            collapsed={props.collapsed}
            layoutId={props.isMobile ? "research-step-tab-mobile" : "research-step-tab"}
            onSelect={(step) => {
              props.onSelectStep(step);
              props.onCloseMobile();
            }}
          />
        </div>
      </div>
      <SidebarBottomFooter {...props} />
    </div>
  );
}
