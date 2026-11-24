"use client";

import { Modal } from "@heroui/react";
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
      <Modal.Container placement="center">
        <Modal.Dialog
          className={cn(
            "w-[min(92vw,520px)] rounded-card border border-strong bg-surface-elevated p-6 shadow-overlay",
            className,
          )}
        >
          <Modal.CloseTrigger />
          <Modal.Header className="pb-4">
            {icon ? (
              <Modal.Icon className="mb-3 bg-titanium-subtle text-ink-primary">{icon}</Modal.Icon>
            ) : null}
            <Modal.Heading className="text-xl font-semibold tracking-tight text-ink-primary">
              {title}
            </Modal.Heading>
            {subtitle ? <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p> : null}
          </Modal.Header>
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
