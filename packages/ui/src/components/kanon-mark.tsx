import type { SVGProps } from "react";
import { cn } from "../lib/cn";

export interface KanonMarkProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

export function KanonMark({ size = 22, className, ...props }: KanonMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="8 0 84 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("shrink-0 text-ink-primary", className)}
      {...props}
    >
      {/* Left Anchor Pillar: fundamentals & trading discipline */}
      <path d="M16.3 0H24.8L27.4 48.1L12 66.3L16.3 0Z" fill="currentColor" />
      {/* Sweeping S-Ribbon: compounding trajectory */}
      <path
        d="M73.8 0H89.4C88.2 21.5 76.2 38.2 49.6 50C35.2 63.4 27.6 79.4 26.7 100H10.6C11.4 77.2 19.6 60.8 36 50C59.8 34.4 72.1 19.8 73.8 0Z"
        fill="currentColor"
      />
      {/* Detached Lower-Right Leg: asymmetric conviction */}
      <path
        d="M54.5 54.8C64.2 63.6 74.8 77.5 88.9 100H72.1C64.5 84.8 56.6 70.6 46.8 60.4L54.5 54.8Z"
        fill="currentColor"
      />
    </svg>
  );
}
