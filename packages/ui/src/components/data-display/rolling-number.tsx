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
  return (
    <NumberFlow
      value={Number.isFinite(value) ? value : 0}
      prefix={prefix}
      suffix={suffix}
      locales="en-US"
      transformTiming={FLOW_TIMING}
      spinTiming={FLOW_TIMING}
      opacityTiming={FLOW_OPACITY}
      format={{
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay,
      }}
      className={cn("font-mono tabular-nums", className)}
    />
  );
}
