"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { IconX } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { KANON_SPRING, KANON_TRANSITION_FAST } from "../lib/motion";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  footer?: ReactNode;
  children: ReactNode;
}

function SheetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
      <div>
        <Dialog.Title className="text-lg font-semibold tracking-tight text-ink-primary">
          {title}
        </Dialog.Title>
        {subtitle ? (
          <Dialog.Description className="mt-1 text-sm text-ink-secondary">
            {subtitle}
          </Dialog.Description>
        ) : null}
      </div>
      <Dialog.Close asChild>
        <button
          type="button"
          aria-label="关闭抽屉"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-control border border-hairline bg-surface text-ink-secondary transition-colors hover:border-strong hover:text-ink-primary"
        >
          <IconX size={16} stroke={1.5} />
        </button>
      </Dialog.Close>
    </div>
  );
}

export function Sheet({ open, onOpenChange, title, subtitle, footer, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={KANON_TRANSITION_FAST}
                className="kanon-backdrop fixed inset-0 z-50"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={KANON_SPRING}
                className="fixed bottom-3 right-3 top-3 z-50 flex w-[min(92vw,520px)] flex-col overflow-hidden rounded-card border border-strong bg-surface-elevated shadow-overlay focus:outline-none"
              >
                <SheetHeader title={title} subtitle={subtitle} />
                <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer ? (
                  <div className="shrink-0 border-t border-hairline bg-surface-elevated px-6 py-4">
                    {footer}
                  </div>
                ) : null}
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
