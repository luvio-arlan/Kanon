"use client";

import { Modal } from "@heroui/react";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  size?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
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
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} className="kanon-backdrop">
      <Modal.Container className="kanon-sheet-container h-dvh w-full max-w-none items-end justify-center p-3 sm:w-full sm:p-3">
        <Modal.Dialog
          className={cn(
            "kanon-dialog-panel flex h-full max-w-none flex-col overflow-hidden rounded-card border border-strong bg-surface-elevated p-0 shadow-overlay focus:outline-none",
            size === "lg" ? "w-[min(94vw,760px)]" : "w-[min(92vw,500px)]",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
            <div>
              <Modal.Heading className="text-lg font-semibold tracking-tight text-ink-primary">
                {title}
              </Modal.Heading>
              {subtitle ? <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭抽屉"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-hairline bg-surface text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
            >
              <IconX size={16} stroke={1.5} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
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
