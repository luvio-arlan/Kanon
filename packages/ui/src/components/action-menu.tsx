"use client";

import { Dropdown } from "@heroui/react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface ActionMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  onSelect: () => void;
}

export interface ActionMenuProps {
  trigger: ReactNode;
  ariaLabel: string;
  items: readonly ActionMenuItem[];
  triggerClassName?: string;
  placement?: "bottom end" | "bottom start";
}

function ActionMenuEntry({ item }: { item: ActionMenuItem }) {
  return (
    <Dropdown.Item
      id={item.id}
      textValue={item.label}
      variant={item.tone === "danger" ? "danger" : "default"}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-control px-2.5 py-2 text-xs font-medium outline-none transition-colors",
        item.tone === "danger"
          ? "text-status-fail data-[hovered=true]:bg-status-fail-soft/70"
          : "text-ink-primary data-[hovered=true]:bg-muted",
      )}
    >
      <span className="flex items-center gap-2">
        {item.icon ? <span className="text-ink-muted">{item.icon}</span> : null}
        <span>{item.label}</span>
      </span>
      {item.shortcut ? (
        <kbd className="font-mono text-xs text-ink-muted">{item.shortcut}</kbd>
      ) : null}
    </Dropdown.Item>
  );
}

export function ActionMenu({
  trigger,
  ariaLabel,
  items,
  triggerClassName,
  placement = "bottom end",
}: ActionMenuProps) {
  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control",
          "border border-hairline bg-surface px-2.5 text-xs font-medium text-ink-secondary",
          "transition-colors hover:border-strong hover:text-ink-primary focus:outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent-coral",
          triggerClassName,
        )}
      >
        {trigger}
      </Dropdown.Trigger>
      <Dropdown.Popover placement={placement} className="z-50 min-w-[208px]">
        <Dropdown.Menu
          onAction={(key) => items.find((item) => item.id === String(key))?.onSelect()}
          className="p-1.5"
        >
          {items.map((item) => (
            <ActionMenuEntry key={item.id} item={item} />
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
