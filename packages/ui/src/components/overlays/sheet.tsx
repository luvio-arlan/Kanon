"use client";

import { Modal } from "@heroui/react";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ScrollFade, useScrollFade } from "./scroll-fade";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}

function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
      <div className="min-w-0">
        <Modal.Heading className="text-lg font-semibold tracking-tight text-ink-primary">
          {title}
        </Modal.Heading>
        {subtitle ? <p className="mt-1 text-xs text-ink-secondary">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭抽屉"
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-hairline bg-surface text-ink-secondary transition-colors duration-150 hover:border-strong hover:bg-muted/60 hover:text-ink-primary"
      >
        <IconX size={15} stroke={1.5} />
      </button>
    </div>
  );
}

export function Sheet({
  open,
  onOpenChange,
  title,
  subtitle,
  size = "md",
  footer,
  children,
}: SheetProps) {
  const fade = useScrollFade();
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) fade.reset();
        onOpenChange(next);
      }}
      className="kanon-backdrop"
    >
      <Modal.Container className="kanon-sheet-container h-dvh w-full max-w-none items-end justify-center p-3 sm:w-full sm:p-3">
        <Modal.Dialog
          className={cn(
            "kanon-dialog-panel flex h-full max-w-none flex-col overflow-hidden rounded-card border border-strong bg-surface-elevated p-0 shadow-overlay focus:outline-none",
            size === "lg" ? "w-[min(94vw,760px)]" : "w-[min(92vw,560px)]",
          )}
        >
          <SheetHeader title={title} subtitle={subtitle} onClose={() => onOpenChange(false)} />
          <div className="relative min-h-0 flex-1">
            <div
              onScroll={fade.onScroll}
              className="kanon-scroll-thin h-full overflow-y-auto px-6 py-5"
            >
              {children}
            </div>
            <ScrollFade progress={fade.progress} surfaceClassName="from-surface-elevated" />
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-hairline bg-surface-elevated px-6 py-4">
              {footer}
            </div>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
