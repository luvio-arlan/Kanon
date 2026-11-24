"use client";

import {
  extractChinaMobileDigits,
  formatChinaPhoneDisplay,
  normalizeChinaPhone,
} from "@kanon/core";
import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
import { useId, useState } from "react";

export interface PhoneFieldProps {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  externalError?: string | null;
}

function resolvePhoneStatus(digits: string, touched: boolean, externalError?: string | null) {
  const isValid = normalizeChinaPhone(digits) !== null;
  if (externalError) return { tone: "error" as const, message: externalError, isValid };
  if (isValid) return { tone: "valid" as const, message: "+86 中国大陆手机号格式有效", isValid };
  if (!touched || digits.length === 0) {
    return {
      tone: "idle" as const,
      message:
        digits.length > 0
          ? `已输入 ${digits.length} / 11 位数字`
          : "支持直接输入或粘贴 11 位手机号",
      isValid,
    };
  }
  if (digits.length >= 2 && !/^1[3-9]/.test(digits)) {
    return { tone: "error" as const, message: "中国大陆手机号应以 13–19 开头", isValid };
  }
  return {
    tone: "error" as const,
    message: `还差 ${Math.max(1, 11 - digits.length)} 位数字（共 11 位）`,
    isValid,
  };
}

function resolvePhoneRingTone(tone: "error" | "valid" | "idle"): string {
  if (tone === "error") {
    return "border-status-fail/60 focus-within:border-status-fail focus-within:ring-status-fail-soft";
  }
  if (tone === "valid") {
    return "border-status-pass/45 focus-within:border-accent-coral focus-within:ring-accent-coral-soft";
  }
  return "border-hairline hover:border-strong focus-within:border-accent-coral focus-within:ring-accent-coral-soft";
}

function PhoneStatusHint({ tone, message }: { tone: "error" | "valid" | "idle"; message: string }) {
  if (tone === "error") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-status-fail">
        <IconAlertCircle size={13} stroke={1.5} className="shrink-0" />
        <span>{message}</span>
      </div>
    );
  }
  return (
    <div className={`text-xs ${tone === "valid" ? "text-status-pass" : "text-ink-muted"}`}>
      {message}
    </div>
  );
}

function PhoneTrailingSlot(props: {
  hasDigits: boolean;
  isValid: boolean;
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 pr-2.5">
      {props.hasDigits && !props.disabled ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={props.onClear}
          aria-label="清空手机号"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary"
        >
          <IconX size={13} stroke={1.5} />
        </button>
      ) : null}
      {props.isValid ? (
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-pill bg-status-pass-soft text-status-pass"
        >
          <IconCheck size={12} stroke={1.5} />
        </span>
      ) : null}
    </div>
  );
}

export function PhoneField({ value, onChange, disabled = false, externalError }: PhoneFieldProps) {
  const inputId = useId();
  const [touched, setTouched] = useState(false);
  const digits = extractChinaMobileDigits(value);
  const status = resolvePhoneStatus(digits, touched, externalError);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-xs font-medium text-ink-primary">
          中国大陆手机号
        </label>
        <span className="font-mono text-xs text-ink-muted tabular-nums">CN · +86</span>
      </div>
      <div
        className={`flex h-11 items-center overflow-hidden rounded-control border bg-surface transition-[border-color,box-shadow] duration-150 focus-within:ring-2 ${resolvePhoneRingTone(status.tone)}`}
      >
        <span className="flex h-full shrink-0 items-center border-r border-hairline bg-muted/75 px-3 font-mono text-sm font-medium text-ink-primary select-none">
          +86
        </span>
        <input
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          value={formatChinaPhoneDisplay(digits)}
          onChange={(e) => onChange(extractChinaMobileDigits(e.target.value))}
          onBlur={() => setTouched(true)}
          placeholder="138 0013 8000"
          aria-invalid={status.tone === "error"}
          className="h-full w-full min-w-0 bg-transparent px-3 font-mono text-sm tracking-wider text-ink-primary tabular-nums placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <PhoneTrailingSlot
          hasDigits={digits.length > 0}
          isValid={status.isValid}
          disabled={disabled}
          onClear={() => onChange("")}
        />
      </div>
      <PhoneStatusHint tone={status.tone} message={status.message} />
    </div>
  );
}
