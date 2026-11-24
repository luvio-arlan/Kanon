"use client";

import { Modal } from "@heroui/react";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

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
        "flex w-full flex-col rounded-2xl border border-hairline bg-muted/40 pl-4",
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
    <div className="flex min-h-[56px] w-full items-center justify-between gap-4 border-b border-hairline py-3 pr-4 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-primary">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-ink-muted">{description}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
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
      <div className="hidden px-2.5 pb-2 pt-1.5 font-mono text-xs tracking-[0.08em] text-ink-muted sm:block">
        SETTINGS
      </div>
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            title={tab.label}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left text-sm transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral",
              active
                ? "border border-hairline bg-surface font-semibold text-ink-primary shadow-pill-active"
                : "border border-transparent font-medium text-ink-secondary hover:bg-muted/75 hover:text-ink-primary",
            )}
          >
            <span className={cn("shrink-0", active ? "text-ink-primary" : "text-ink-muted")}>
              {tab.icon}
            </span>
            <span className="hidden truncate sm:inline">{tab.label}</span>
          </button>
        );
      })}
    </nav>
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
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} className="kanon-backdrop">
      <Modal.Container placement="center" size="lg" className="kanon-dialog-container">
        <Modal.Dialog
          aria-label="工作台设置"
          className="kanon-dialog-panel flex h-[min(84vh,560px)] w-[min(94vw,820px)] max-w-[min(94vw,820px)] flex-row overflow-clip rounded-[24px] border border-strong bg-surface p-0 shadow-overlay focus:outline-none"
        >
          <SettingsNavRail tabs={tabs} activeTab={activeTab} onSelectTab={onSelectTab} />
          <div className="flex min-w-0 flex-1 flex-col bg-surface">
            <header className="flex shrink-0 items-center justify-between border-b border-hairline px-7 pb-4 pt-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-primary">{title}</h2>
              <button
                type="button"
                aria-label="关闭设置"
                onClick={() => onOpenChange(false)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill bg-muted/80 text-ink-secondary transition-colors hover:bg-muted hover:text-ink-primary"
              >
                <IconX size={16} stroke={1.5} />
              </button>
            </header>
            <div className="kanon-scroll-thin min-h-0 flex-1 overflow-y-auto px-7 py-6">
              {children}
            </div>
          </div>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
