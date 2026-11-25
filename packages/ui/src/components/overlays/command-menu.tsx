"use client";

import { Modal } from "@heroui/react";
import { IconCornerDownLeft, IconSearch } from "@tabler/icons-react";
import { Command } from "cmdk";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";
import { KANON_TAB_TRANSITION } from "../../lib/motion";
import { Kbd } from "../primitives/kbd";

export interface CommandActionItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  keywords?: string[];
  icon?: ReactNode;
  onSelect: () => void;
}

export interface CommandActionGroup {
  heading: string;
  items: CommandActionItem[];
  secondary?: boolean;
}

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandActionGroup[];
  placeholder?: string;
}

function CommandRow({
  item,
  onRun,
}: {
  item: CommandActionItem;
  onRun: (action: CommandActionItem) => void;
}) {
  return (
    <Command.Item
      value={[item.label, item.description ?? "", ...(item.keywords ?? [])].join(" ")}
      onSelect={() => onRun(item)}
      className={cn(
        "group flex h-10 cursor-pointer items-center justify-between gap-3 rounded-item px-2.5",
        "text-sm text-ink-primary outline-none transition-colors duration-150 ease-[var(--ease-kanon)]",
        "data-[selected=true]:bg-muted data-[selected=true]:text-ink-primary",
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {item.icon ? (
          <span className="shrink-0 text-ink-muted transition-colors group-data-[selected=true]:text-ink-primary">
            {item.icon}
          </span>
        ) : null}
        <span className="truncate font-medium text-ink-primary">{item.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {item.description ? (
          <span className="hidden max-w-[180px] truncate text-xs text-ink-muted sm:inline">
            {item.description}
          </span>
        ) : null}
        {item.shortcut ? (
          <Kbd>{item.shortcut}</Kbd>
        ) : (
          <IconCornerDownLeft
            size={14}
            stroke={1.5}
            className="text-accent-coral opacity-0 -translate-x-1 transition-[opacity,transform] duration-150 group-data-[selected=true]:translate-x-0 group-data-[selected=true]:opacity-100"
          />
        )}
      </span>
    </Command.Item>
  );
}

function ScopeSwitcher({
  scope,
  onScope,
}: {
  scope: "main" | "glossary";
  onScope: (next: "main" | "glossary") => void;
}) {
  const tabs: ReadonlyArray<{ id: "main" | "glossary"; label: string }> = [
    { id: "main", label: "指令" },
    { id: "glossary", label: "术语" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-control border border-hairline bg-canvas p-0.5">
      {tabs.map((tab) => {
        const active = scope === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onScope(tab.id)}
            className={cn(
              "relative h-7 cursor-pointer rounded-badge px-2.5 text-xs font-medium transition-colors",
              active ? "text-ink-primary" : "text-ink-muted hover:text-ink-primary",
            )}
          >
            {active ? (
              <motion.span
                layoutId="command-scope-pill"
                transition={KANON_TAB_TRANSITION}
                className="pointer-events-none absolute inset-0 rounded-badge bg-muted shadow-pill-active"
              />
            ) : null}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CommandFooterBar() {
  return (
    <div className="flex h-10 items-center justify-between border-t border-hairline px-4 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span>切换</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>↵</Kbd>
        <span>执行</span>
      </span>
    </div>
  );
}

function CommandSearchBar(p: {
  query: string;
  placeholder: string;
  hasSecondary: boolean;
  scope: "main" | "glossary";
  onQuery: (next: string) => void;
  onScope: (next: "main" | "glossary") => void;
}) {
  return (
    <div className="flex h-12 items-center gap-2.5 border-b border-hairline px-4">
      <IconSearch size={16} stroke={1.5} className="shrink-0 text-ink-muted" />
      <Command.Input
        autoFocus
        value={p.query}
        onValueChange={p.onQuery}
        placeholder={p.placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
      />
      {p.hasSecondary ? <ScopeSwitcher scope={p.scope} onScope={p.onScope} /> : null}
      <Kbd>ESC</Kbd>
    </div>
  );
}

function CommandPaletteBody({
  groups,
  placeholder,
  onRun,
}: {
  groups: CommandActionGroup[];
  placeholder: string;
  onRun: (item: CommandActionItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"main" | "glossary">("main");
  const hasSecondary = groups.some((g) => g.secondary && g.items.length > 0);
  const visibleGroups = groups.filter((g) => {
    if (g.items.length === 0) return false;
    if (query.trim()) return true;
    return scope === "glossary" ? Boolean(g.secondary) : !g.secondary;
  });

  return (
    <Command label="快捷检索" className="flex w-full flex-col bg-surface">
      <CommandSearchBar
        query={query}
        placeholder={placeholder}
        hasSecondary={hasSecondary}
        scope={scope}
        onQuery={setQuery}
        onScope={setScope}
      />
      <Command.List className="kanon-scroll-thin max-h-[380px] overflow-y-auto p-2">
        <Command.Empty className="py-10 text-center text-sm text-ink-muted">
          未找到匹配项
        </Command.Empty>
        {visibleGroups.map((group) => (
          <Command.Group
            key={group.heading}
            heading={group.heading}
            className="mb-1 last:mb-0 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-muted"
          >
            {group.items.map((item) => (
              <CommandRow key={item.id} item={item} onRun={onRun} />
            ))}
          </Command.Group>
        ))}
      </Command.List>
      <CommandFooterBar />
    </Command>
  );
}

export function CommandMenu({
  open,
  onOpenChange,
  groups,
  placeholder = "搜索标的、术语或快捷操作...",
}: CommandMenuProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  function handleRun(item: CommandActionItem) {
    onOpenChange(false);
    item.onSelect();
  }

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} className="kanon-backdrop">
      <Modal.Container placement="top" size="lg" className="kanon-dialog-container pt-[12vh]">
        <Modal.Dialog
          aria-label="快捷检索"
          className="kanon-dialog-panel w-[min(92vw,560px)] max-w-[min(92vw,560px)] overflow-clip rounded-card border border-strong bg-surface p-0 shadow-overlay focus:outline-none"
        >
          <CommandPaletteBody groups={groups} placeholder={placeholder} onRun={handleRun} />
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
