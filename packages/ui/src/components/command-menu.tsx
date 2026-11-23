"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { IconCornerDownLeft, IconSearch } from "@tabler/icons-react";
import { Command } from "cmdk";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { cn } from "../lib/cn";

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
        "group flex cursor-pointer items-center justify-between gap-3 rounded-control px-3 py-2.5",
        "text-sm text-ink-primary outline-none transition-colors duration-100",
        "data-[selected=true]:bg-muted data-[selected=true]:text-ink-primary",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {item.icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-hairline bg-surface text-ink-secondary group-data-[selected=true]:border-strong group-data-[selected=true]:text-ink-primary">
            {item.icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="truncate font-medium text-ink-primary">{item.label}</div>
          {item.description ? (
            <div className="truncate text-xs text-ink-secondary">{item.description}</div>
          ) : null}
        </div>
      </div>
      {item.shortcut ? (
        <kbd className="shrink-0 rounded-control border border-hairline bg-surface px-2 py-0.5 font-mono text-xs text-ink-muted tabular-nums">
          {item.shortcut}
        </kbd>
      ) : (
        <IconCornerDownLeft
          size={15}
          stroke={1.5}
          className="shrink-0 text-ink-muted opacity-0 transition-opacity group-data-[selected=true]:opacity-100"
        />
      )}
    </Command.Item>
  );
}

function CommandGroupBlock({
  group,
  onRun,
}: {
  group: CommandActionGroup;
  onRun: (action: CommandActionItem) => void;
}) {
  return (
    <Command.Group
      heading={group.heading}
      className={cn(
        "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3",
        "[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-muted",
      )}
    >
      {group.items.map((item) => (
        <CommandRow key={item.id} item={item} onRun={onRun} />
      ))}
    </Command.Group>
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
  return (
    <Command label="卡农快捷指令" className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
        <IconSearch size={18} stroke={1.5} className="shrink-0 text-ink-muted" />
        <Command.Input
          autoFocus
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
        />
        <kbd className="rounded-control border border-hairline bg-muted px-2 py-0.5 font-mono text-xs text-ink-muted">
          ESC
        </kbd>
      </div>
      <Command.List className="max-h-[540px] overflow-y-auto px-2 pb-2">
        <Command.Empty className="py-12 text-center text-sm text-ink-muted">
          未找到匹配的标的、术语或指令
        </Command.Empty>
        {groups.map((group) => (
          <CommandGroupBlock key={group.heading} group={group} onRun={onRun} />
        ))}
      </Command.List>
      <div className="flex items-center justify-between border-t border-hairline bg-muted/40 px-4 py-2.5 text-xs text-ink-muted">
        <div className="flex items-center gap-4">
          <span>↑↓ 切换</span>
          <span>↵ 执行</span>
          <span>ESC 关闭</span>
        </div>
        <span className="font-mono tracking-wider">KANON · 卡农</span>
      </div>
    </Command>
  );
}

export function CommandMenu({
  open,
  onOpenChange,
  groups,
  placeholder = "搜索标的、术语、纪律或快捷操作...",
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="kanon-backdrop fixed inset-0 z-50" />
        <Dialog.Content
          aria-label="卡农快捷指令"
          className={cn(
            "fixed left-1/2 top-[11vh] z-50 w-[min(92vw,580px)] -translate-x-1/2",
            "overflow-hidden rounded-card border border-strong bg-surface-elevated shadow-overlay",
            "focus:outline-none",
          )}
        >
          <Dialog.Title className="sr-only">卡农快捷指令</Dialog.Title>
          <CommandPaletteBody groups={groups} placeholder={placeholder} onRun={handleRun} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
