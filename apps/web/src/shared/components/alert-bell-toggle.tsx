"use client";

import { AlertRuleUpsertResponseSchema } from "@kanon/core";
import { IconBell, IconBellFilled } from "@tabler/icons-react";
import { useState } from "react";
import { kanonFetch } from "../lib/kanon-fetch";

export type AlertToggleConfig =
  | { kind: "price_hurdle"; thesisId: string; targetPrice: number; direction?: "below" | "above" }
  | { kind: "pe_band_breach"; thesisId: string }
  | { kind: "form8k_redflag"; thesisId: string };

async function persistAlertRuleToggle(rule: AlertToggleConfig, enabled: boolean): Promise<boolean> {
  const configJson =
    rule.kind === "price_hurdle"
      ? { targetPrice: rule.targetPrice, direction: rule.direction ?? "below" }
      : {};
  const res = await kanonFetch("/api/inbox", AlertRuleUpsertResponseSchema, {
    method: "POST",
    body: { op: "upsert_rule", thesisId: rule.thesisId, kind: rule.kind, configJson, enabled },
  });
  return res.ok;
}

/** Minimal 14px in-place Swiss Editorial bell toggle for alert rules (zero chrome/popups). */
export function AlertBellToggle({
  rule,
  initialEnabled = false,
  disabled = false,
  title,
}: {
  rule: AlertToggleConfig;
  initialEnabled?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (disabled || busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await persistAlertRuleToggle(rule, next);
    setBusy(false);
    if (ok) setEnabled(next);
  }

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={() => void toggle()}
      title={title}
      aria-label={title ?? "切换自动提醒"}
      aria-pressed={enabled}
      className={
        disabled
          ? "inline-flex h-5 w-5 cursor-not-allowed items-center justify-center rounded-badge text-ink-muted/35"
          : enabled
            ? "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-badge text-accent-coral transition-colors hover:bg-accent-coral-soft"
            : "inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-badge text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary"
      }
    >
      {enabled ? <IconBellFilled size={14} stroke={1.5} /> : <IconBell size={14} stroke={1.5} />}
    </button>
  );
}
