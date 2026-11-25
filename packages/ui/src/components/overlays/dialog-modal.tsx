"use client";

import { Modal } from "@heroui/react";
import { IconX } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface DialogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

function DialogHeaderBar(p: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal.Header className="flex flex-row items-start justify-between gap-4 pb-4">
      <div className="min-w-0">
        {p.icon ? (
          <Modal.Icon className="mb-3 rounded-control bg-titanium-subtle text-ink-primary">
            {p.icon}
          </Modal.Icon>
        ) : null}
        <Modal.Heading className="text-lg font-semibold tracking-[-0.02em] text-ink-primary">
          {p.title}
        </Modal.Heading>
        {p.subtitle ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{p.subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="关闭弹窗"
        onClick={p.onClose}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-hairline bg-surface text-ink-secondary transition-colors duration-150 ease-[var(--ease-kanon)] hover:border-strong hover:bg-muted/60 hover:text-ink-primary"
      >
        <IconX size={15} stroke={1.5} />
      </button>
    </Modal.Header>
  );
}

export function DialogModal({
  open,
  onOpenChange,
  title,
  subtitle,
  icon,
  footer,
  children,
  className,
}: DialogModalProps) {
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange} className="kanon-backdrop">
      <Modal.Container placement="center" size="lg" className="kanon-dialog-container">
        <Modal.Dialog
          className={cn(
            "kanon-dialog-panel w-[min(92vw,560px)] max-w-[min(92vw,560px)] rounded-card border border-strong bg-surface-elevated p-6 shadow-overlay sm:p-7",
            className,
          )}
        >
          <DialogHeaderBar
            title={title}
            subtitle={subtitle}
            icon={icon}
            onClose={() => onOpenChange(false)}
          />
          <Modal.Body className="py-1">{children}</Modal.Body>
          {footer ? (
            <Modal.Footer className="mt-5 flex items-center justify-end gap-2.5 border-t border-hairline pt-4">
              {footer}
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
