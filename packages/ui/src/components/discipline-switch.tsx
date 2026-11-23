"use client";

import { Switch } from "@heroui/react";
import { cn } from "../lib/cn";

export interface DisciplineSwitchProps {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  tone?: "neutral" | "danger";
  compact?: boolean;
}

function CompactSwitch({
  label,
  isSelected,
  onChange,
  violated,
}: {
  label: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  violated: boolean;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} className="inline-flex">
      <Switch.Content className="inline-flex cursor-pointer items-center gap-2.5">
        <Switch.Control className="shrink-0">
          <Switch.Thumb />
        </Switch.Control>
        <span
          className={cn(
            "text-xs font-medium transition-colors",
            violated ? "text-status-fail" : "text-ink-primary",
          )}
        >
          {label}
        </span>
      </Switch.Content>
    </Switch>
  );
}

export function DisciplineSwitch({
  label,
  description,
  isSelected,
  onChange,
  tone = "neutral",
  compact = false,
}: DisciplineSwitchProps) {
  const violated = !isSelected && tone === "danger";
  if (compact) {
    return (
      <CompactSwitch
        label={label}
        isSelected={isSelected}
        onChange={onChange}
        violated={violated}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-control border px-4 py-3 transition-colors duration-150",
        violated ? "border-status-fail/35 bg-status-fail-soft/45" : "border-hairline bg-surface",
      )}
    >
      <Switch isSelected={isSelected} onChange={onChange} className="w-full">
        <Switch.Content className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink-primary">{label}</div>
            {description ? (
              <div className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{description}</div>
            ) : null}
          </div>
          <Switch.Control className="shrink-0">
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}
