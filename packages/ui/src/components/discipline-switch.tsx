"use client";

import { Switch } from "@heroui/react";
import { cn } from "../lib/cn";

export interface DisciplineSwitchProps {
  label: string;
  description: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  tone?: "pass" | "danger";
}

export function DisciplineSwitch({
  label,
  description,
  isSelected,
  onChange,
  tone = "pass",
}: DisciplineSwitchProps) {
  return (
    <div
      className={cn(
        "rounded-control border px-4 py-3.5 transition-colors duration-150",
        isSelected
          ? "border-status-pass/30 bg-status-pass-soft/60"
          : tone === "danger"
            ? "border-status-fail/35 bg-status-fail-soft/50"
            : "border-hairline bg-surface",
      )}
    >
      <Switch isSelected={isSelected} onChange={onChange} className="w-full">
        <Switch.Content className="flex w-full items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-primary">{label}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{description}</div>
          </div>
          <Switch.Control className="shrink-0">
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}
