"use client";

import { Modal } from "@heroui/react";
import { IconX } from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { KANON_LENS_VARIANTS, KANON_TAB_TRANSITION } from "../../lib/motion";
import { ScrollFade, useScrollFade } from "./scroll-fade";

export interface SettingsNavTab<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

export interface SettingsDialogShellProps<T extends string> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tabs: readonly SettingsNavTab<T>[];
  activeTab: T;
  onSelectTab: (next: T) => void;
  children: ReactNode;
}

export function SettingsSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("px-3 pb-2 text-xs font-medium text-ink-muted", className)}>{children}</p>
  );
}

export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-panel border border-hairline bg-muted/40 pl-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-[56px] w-full flex-col items-stretch justify-between gap-3 border-b border-hairline py-3 pr-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-primary">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-ink-muted">{description}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

function SettingsNavButton<T extends string>({
  tab,
  active,
  onSelect,
}: {
  tab: SettingsNavTab<T>;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={tab.label}
      title={tab.label}
      onClick={onSelect}
      className={cn(
        "relative flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral",
        active
          ? "font-semibold text-ink-primary"
          : "font-medium text-ink-secondary hover:bg-muted/75 hover:text-ink-primary",
      )}
    >
      {active ? (
        <>
          <motion.span
            layoutId="settings-nav-bg"
            transition={KANON_TAB_TRANSITION}
            className="pointer-events-none absolute inset-0 rounded-control border border-hairline bg-surface shadow-pill-active"
          />
          <motion.span
            layoutId="settings-nav-bar"
            transition={KANON_TAB_TRANSITION}
            className="pointer-events-none absolute bottom-2 left-0.5 top-2 w-[2.5px] rounded-pill bg-accent-coral"
          />
        </>
      ) : null}
      <span
        className={cn("relative z-10 shrink-0", active ? "text-ink-primary" : "text-ink-muted")}
      >
        {tab.icon}
      </span>
      <span className="relative z-10 hidden truncate sm:inline">{tab.label}</span>
    </button>
  );
}

function SettingsNavRail<T extends string>({
  tabs,
  activeTab,
  onSelectTab,
}: {
  tabs: readonly SettingsNavTab<T>[];
  activeTab: T;
  onSelectTab: (next: T) => void;
}) {
  return (
    <nav
      aria-label="设置分类"
      className="flex w-14 shrink-0 flex-col gap-1 border-r border-hairline bg-sidebar p-2.5 sm:w-52 sm:p-3"
    >
      {tabs.map((tab) => (
        <SettingsNavButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeTab}
          onSelect={() => onSelectTab(tab.id)}
        />
      ))}
    </nav>
  );
}

function SettingsBodyPane({
  title,
  activeTab,
  fade,
  onClose,
  children,
}: {
  title: string;
  activeTab: string;
  fade: ReturnType<typeof useScrollFade>;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-surface">
      <SettingsPanelHeader title={title} onClose={onClose} />
      <div className="relative min-h-0 flex-1">
        <div
          onScroll={fade.onScroll}
          className="kanon-scroll-thin h-full overflow-y-auto px-4 py-5 sm:px-7 sm:py-6"
        >
          <motion.div
            key={activeTab}
            variants={KANON_LENS_VARIANTS}
            initial="enter"
            animate="center"
          >
            {children}
          </motion.div>
        </div>
        <ScrollFade progress={fade.progress} surfaceClassName="from-surface" />
      </div>
    </div>
  );
}

function SettingsPanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-hairline px-4 pb-4 pt-5 sm:px-7 sm:pt-6">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-primary">{title}</h2>
      <button
        type="button"
        aria-label="关闭设置"
        onClick={onClose}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill bg-muted/80 text-ink-secondary transition-colors hover:bg-muted hover:text-ink-primary"
      >
        <IconX size={16} stroke={1.5} />
      </button>
    </header>
  );
}

export function SettingsDialogShell<T extends string>({
  open,
  onOpenChange,
  title,
  tabs,
  activeTab,
  onSelectTab,
  children,
}: SettingsDialogShellProps<T>) {
  const fade = useScrollFade();
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) fade.reset();
        onOpenChange(next);
      }}
      className="kanon-backdrop"
    >
      <Modal.Container placement="center" size="lg" className="kanon-dialog-container">
        <Modal.Dialog
          aria-label="工作台设置"
          className="kanon-dialog-panel flex h-[min(86vh,590px)] w-[min(94vw,840px)] max-w-[min(94vw,840px)] flex-row overflow-clip rounded-card border border-strong bg-surface p-0 shadow-overlay focus:outline-none"
        >
          <SettingsNavRail
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={(next) => {
              fade.reset();
              onSelectTab(next);
            }}
          />
          <SettingsBodyPane
            title={title}
            activeTab={activeTab}
            fade={fade}
            onClose={() => onOpenChange(false)}
          >
            {children}
          </SettingsBodyPane>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
