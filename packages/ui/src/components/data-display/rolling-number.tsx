"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "../../lib/cn";

export interface RollingNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
  className?: string;
}

const FLOW_TIMING = { duration: 260, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } as const;
const FLOW_OPACITY = { duration: 160, easing: "ease-out" } as const;

export function RollingNumber({
  value,
  decimals = 1,
  prefix,
  suffix,
  signDisplay = "auto",
  className,
}: RollingNumberProps) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const compact = Math.abs(safeValue) >= 1_000_000;
  const format = compact
    ? { notation: "compact" as const, maximumSignificantDigits: 4, signDisplay }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay };

  return (
    <NumberFlow
      value={safeValue}
      prefix={prefix}
      suffix={suffix}
      locales="en-US"
      transformTiming={FLOW_TIMING}
      spinTiming={FLOW_TIMING}
      opacityTiming={FLOW_OPACITY}
      format={format}
      className={cn("font-mono tabular-nums", className)}
    />
  );
}
