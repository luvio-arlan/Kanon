"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "./theme-provider";

export function Toaster() {
  const { theme } = useTheme();

  return (
    <SonnerToaster
      theme={theme}
      position="top-center"
      offset={68}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-card !border !border-hairline !bg-surface-elevated !text-ink-primary !shadow-overlay !font-sans",
          title: "!text-sm !font-medium !text-ink-primary",
          description: "!text-xs !text-ink-secondary",
          actionButton: "!rounded-control !bg-ink-primary !text-ink-inverse !text-xs !font-medium",
          cancelButton: "!rounded-control !bg-muted !text-ink-secondary !text-xs",
        },
      }}
    />
  );
}
