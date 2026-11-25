"use client";

import { IconSearch } from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { KANON_TAB_TRANSITION } from "../../lib/motion";
import { Kbd } from "../primitives/kbd";

export interface SidebarSectionProps {
  title: string;
  collapsed?: boolean;
  children: ReactNode;
  className?: string;
}

export function SidebarSection({
  title,
  collapsed = false,
  children,
  className,
}: SidebarSectionProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {!collapsed ? (
        <div className="px-3 pb-1 pt-2 font-mono text-xs font-medium tracking-[0.06em] text-ink-muted">
          {title}
        </div>
      ) : (
        <div aria-hidden="true" className="mx-2 my-1.5 h-px bg-hairline" />
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export interface SidebarNavItemProps {
  label: string;
  code?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  collapsed?: boolean;
  layoutId?: string;
  onClick: () => void;
  className?: string;
}

function ActiveBackdrop({ layoutId }: { layoutId?: string }) {
  if (layoutId) {
    return (
      <>
        <motion.span
          layoutId={`${layoutId}-bg`}
          transition={KANON_TAB_TRANSITION}
          className="pointer-events-none absolute inset-0 rounded-control border border-hairline bg-surface shadow-pill-active"
        />
        <motion.span
          layoutId={`${layoutId}-bar`}
          transition={KANON_TAB_TRANSITION}
          className="pointer-events-none absolute bottom-2 left-0.5 top-2 w-[2.5px] rounded-pill bg-accent-coral"
        />
      </>
    );
  }
  return (
    <>
      <span className="pointer-events-none absolute inset-0 rounded-control border border-hairline bg-surface shadow-pill-active" />
      <span className="pointer-events-none absolute bottom-2 left-0.5 top-2 w-[2.5px] rounded-pill bg-accent-coral" />
    </>
  );
}

function NavBadgeSlot({ badge, active }: { badge: ReactNode; active: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center justify-center rounded-badge px-1.5 py-0.5 font-mono text-xs tabular-nums",
        active ? "bg-muted text-ink-primary font-medium" : "text-ink-muted",
      )}
    >
      {badge}
    </span>
  );
}

function NavLeadingContent(p: {
  icon?: ReactNode;
  code?: string;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <span className="relative z-10 flex min-w-0 items-center gap-2.5">
      {p.icon ? (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center transition-colors",
            p.active ? "text-ink-primary" : "text-ink-muted group-hover:text-ink-primary",
          )}
        >
          {p.icon}
        </span>
      ) : null}
      {p.code ? (
        <span
          className={cn(
            "shrink-0 font-mono text-xs tabular-nums",
            p.active ? "font-semibold text-accent-coral" : "text-ink-muted",
          )}
        >
          {p.code}
        </span>
      ) : null}
      {!p.collapsed ? (
        <span className={cn("truncate text-sm", p.active ? "font-semibold" : "font-medium")}>
          {p.label}
        </span>
      ) : null}
    </span>
  );
}

export function SidebarNavItem({
  label,
  code,
  icon,
  badge,
  trailing,
  active = false,
  collapsed = false,
  layoutId,
  onClick,
  className,
}: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex w-full cursor-pointer items-center justify-between gap-2 rounded-control text-left transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral/70",
        collapsed ? "h-10 justify-center px-0" : "h-10 px-3",
        active ? "text-ink-primary" : "text-ink-secondary hover:bg-muted/75 hover:text-ink-primary",
        className,
      )}
    >
      {active ? <ActiveBackdrop layoutId={layoutId} /> : null}
      <NavLeadingContent
        icon={icon}
        code={code}
        label={label}
        active={active}
        collapsed={collapsed}
      />
      {!collapsed && trailing ? <span className="relative z-10 shrink-0">{trailing}</span> : null}
      {!collapsed && badge !== undefined ? <NavBadgeSlot badge={badge} active={active} /> : null}
    </button>
  );
}

export function SidebarSearchTrigger({
  collapsed = false,
  placeholder = "快速检索",
  shortcut = "⌘K",
  onClick,
}: {
  collapsed?: boolean;
  placeholder?: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={placeholder}
      title={collapsed ? `${placeholder} (${shortcut})` : undefined}
      className={cn(
        "flex h-10 w-full cursor-pointer items-center rounded-control border border-hairline bg-muted/65 text-sm text-ink-secondary transition-colors hover:border-strong hover:bg-muted hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral/70",
        collapsed ? "justify-center px-0" : "justify-between px-3",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconSearch size={16} stroke={1.5} className="shrink-0 text-ink-muted" />
        {!collapsed ? <span className="truncate">{placeholder}</span> : null}
      </span>
      {!collapsed ? <Kbd>{shortcut}</Kbd> : null}
    </button>
  );
}
