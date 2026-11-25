"use client";

import { IconMenu2, IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { KANON_DRAWER_SPRING, KANON_TRANSITION_FAST } from "../../lib/motion";
import { KanonMark } from "../primitives/kanon-mark";

export interface WorkbenchShellProps {
  sidebar: (ctx: {
    collapsed: boolean;
    isMobile: boolean;
    onToggleCollapse: () => void;
    closeMobile: () => void;
  }) => ReactNode;
  mobileTitle?: ReactNode;
  mobileActions?: ReactNode;
  hideSidebar?: boolean;
  children: ReactNode;
  className?: string;
}

function MobileTopBar({
  title,
  actions,
  onOpenNav,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  onOpenNav: () => void;
}) {
  return (
    <div className="no-print kanon-topbar-glass sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="打开工作台侧栏"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-control border border-hairline bg-surface text-ink-primary shadow-button"
        >
          <IconMenu2 size={18} stroke={1.5} />
        </button>
        {title ?? (
          <span className="inline-flex items-center gap-2">
            <KanonMark size={18} accent />
            <span className="text-sm font-semibold tracking-[0.22em] text-ink-primary">KANON</span>
          </span>
        )}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function MobileDrawerPanel({ onClose, content }: { onClose: () => void; content: ReactNode }) {
  return (
    <motion.div
      initial={{ x: -296, opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -296, opacity: 0 }}
      transition={KANON_DRAWER_SPRING}
      className="relative z-10 flex h-full w-[296px] max-w-[85vw] p-3"
    >
      <div className="kanon-surface-specular relative flex h-full w-full flex-col overflow-hidden rounded-card border border-strong bg-sidebar shadow-overlay">
        <button
          type="button"
          aria-label="关闭侧栏"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary"
        >
          <IconX size={16} stroke={1.5} />
        </button>
        {content}
      </div>
    </motion.div>
  );
}

function MobileSidebarDrawer({
  open,
  onClose,
  content,
}: {
  open: boolean;
  onClose: () => void;
  content: ReactNode;
}) {
  useEscapeClose(open, onClose);
  return (
    <AnimatePresence>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="导航侧栏"
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <motion.button
            type="button"
            aria-label="关闭侧栏"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={KANON_TRANSITION_FAST}
            className="kanon-backdrop absolute inset-0 cursor-pointer"
          />
          <MobileDrawerPanel onClose={onClose} content={content} />
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function DesktopSidebarFrame({ collapsed, content }: { collapsed: boolean; content: ReactNode }) {
  return (
    <aside
      className={cn(
        "no-print hidden h-full shrink-0 p-4 pr-0 transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex",
        collapsed ? "w-[84px]" : "w-[276px]",
      )}
    >
      <div className="kanon-surface-specular flex h-full w-full flex-col overflow-hidden rounded-card border border-hairline bg-sidebar shadow-sidebar">
        {content}
      </div>
    </aside>
  );
}

export function WorkbenchShell({
  sidebar,
  mobileTitle,
  mobileActions,
  hideSidebar = false,
  children,
  className,
}: WorkbenchShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleCollapse = () => setCollapsed((v) => !v);
  const closeMobile = () => setMobileOpen(false);
  const desktopBar = sidebar({
    collapsed,
    isMobile: false,
    onToggleCollapse: toggleCollapse,
    closeMobile,
  });
  const mobileBar = mobileOpen
    ? sidebar({ collapsed: false, isMobile: true, onToggleCollapse: toggleCollapse, closeMobile })
    : null;

  return (
    <div
      className={cn("kanon-ambient-canvas flex h-dvh w-full overflow-hidden bg-canvas", className)}
    >
      {!hideSidebar ? <DesktopSidebarFrame collapsed={collapsed} content={desktopBar} /> : null}
      {!hideSidebar ? (
        <MobileSidebarDrawer open={mobileOpen} onClose={closeMobile} content={mobileBar} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!hideSidebar ? (
          <MobileTopBar
            title={mobileTitle}
            actions={mobileActions}
            onOpenNav={() => setMobileOpen(true)}
          />
        ) : null}
        <main className="kanon-scroll-thin relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
