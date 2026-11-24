import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  tone?: "surface" | "titanium" | "muted";
}

export function Card({ className, interactive = false, tone = "surface", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-hairline shadow-card transition-[border-color,box-shadow,transform] duration-200",
        tone === "surface" && "bg-surface",
        tone === "titanium" && "bg-titanium-subtle",
        tone === "muted" && "bg-muted",
        interactive && "hover:border-strong hover:shadow-card-hover",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-hairline px-6 py-3.5",
        className,
      )}
      {...props}
    />
  );
}
