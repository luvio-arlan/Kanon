"use client";

import NumberFlow from "@number-flow/react";
import { cn } from "../lib/cn";

export interface RollingNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  signDisplay?: "auto" | "always" | "exceptZero" | "never";
  className?: string;
}

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
      format={{
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay,
      }}
      className={cn("font-mono tabular-nums", className)}
    />
  );
}
