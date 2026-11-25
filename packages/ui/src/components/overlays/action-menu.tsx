"use client";

import { Dropdown } from "@heroui/react";
import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ActionMenuItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: ReactNode;
  selected?: boolean;
  tone?: "default" | "danger";
  onSelect: () => void;
}

export interface ActionMenuProps {
  trigger: ReactNode;
  ariaLabel: string;
  items: readonly ActionMenuItem[];
  triggerClassName?: string;
  popoverClassName?: string;
  placement?: "bottom end" | "bottom start" | "top start" | "top end";
}

function ActionMenuEntryLabel({
  item,
  hasSelectable,
}: {
  item: ActionMenuItem;
  hasSelectable: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {hasSelectable ? (
        <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
          {item.selected ? (
            <IconCheck size={14} stroke={1.5} className="text-accent-coral" />
          ) : null}
        </span>
      ) : null}
      {item.icon ? (
        <span
          className={cn("shrink-0", item.tone === "danger" ? "text-status-fail" : "text-ink-muted")}
        >
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate">{item.label}</span>
        {item.description ? (
          <span className="block truncate text-xs font-normal text-ink-muted">
            {item.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function ActionMenuEntry({
  item,
  hasSelectable,
}: {
  item: ActionMenuItem;
  hasSelectable: boolean;
}) {
  const toneCls =
    item.tone === "danger"
      ? "font-medium text-status-fail data-[hovered=true]:bg-status-fail-soft/75 data-[focused=true]:bg-status-fail-soft/75"
      : item.selected
        ? "bg-muted/65 font-semibold text-ink-primary data-[hovered=true]:bg-muted data-[focused=true]:bg-muted"
        : "font-medium text-ink-primary data-[hovered=true]:bg-muted/85 data-[focused=true]:bg-muted/85";
  return (
    <Dropdown.Item
      id={item.id}
      textValue={item.label}
      variant={item.tone === "danger" ? "danger" : "default"}
      className={cn(
        "flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-item px-2.5 py-2 text-sm outline-none",
        "transition-colors duration-150 ease-[var(--ease-kanon)] motion-reduce:transition-none",
        toneCls,
      )}
    >
      <ActionMenuEntryLabel item={item} hasSelectable={hasSelectable} />
      {item.shortcut ? (
        <kbd className="shrink-0 font-mono text-xs text-ink-muted tabular-nums">
          {item.shortcut}
        </kbd>
      ) : null}
    </Dropdown.Item>
  );
}

export function ActionMenu({
  trigger,
  ariaLabel,
  items,
  triggerClassName,
  popoverClassName,
  placement = "bottom end",
}: ActionMenuProps) {
  const hasSelectable = items.some((item) => item.selected !== undefined);

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control",
          "border border-hairline bg-surface px-3 text-sm font-medium text-ink-secondary shadow-button",
          "transition-[background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-kanon)] motion-reduce:transition-none",
          "hover:border-strong hover:bg-muted/40 hover:text-ink-primary active:bg-muted",
          "data-[open=true]:border-strong data-[open=true]:bg-muted/50 data-[open=true]:text-ink-primary",
          "[&[aria-expanded=true]_.kanon-chevron]:rotate-180",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-coral focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
          triggerClassName,
        )}
      >
        {trigger}
      </Dropdown.Trigger>
      <Dropdown.Popover
        placement={placement}
        offset={6}
        className={cn("z-50 min-w-[228px]", popoverClassName)}
      >
        <Dropdown.Menu
          onAction={(key) => items.find((item) => item.id === String(key))?.onSelect()}
          className="kanon-scroll-thin max-h-[320px] space-y-0.5 overflow-y-auto p-1.5"
        >
          {items.map((item) => (
            <ActionMenuEntry key={item.id} item={item} hasSelectable={hasSelectable} />
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
