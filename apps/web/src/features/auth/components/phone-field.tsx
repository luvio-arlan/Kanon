"use client";

import {
  extractChinaMobileDigits,
  formatChinaPhoneDisplay,
  normalizeChinaPhone,
} from "@kanon/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useId, useState } from "react";

export interface PhoneFieldProps {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  externalError?: string | null;
}

function resolvePhoneError(digits: string, touched: boolean, externalError?: string | null) {
  if (externalError) return externalError;
  if (!touched || digits.length === 0) return null;
  if (normalizeChinaPhone(digits) !== null) return null;
  if (digits.length >= 2 && !/^1[3-9]/.test(digits)) {
    return "中国大陆手机号应以 13–19 开头";
  }
  return `还差 ${Math.max(1, 11 - digits.length)} 位数字`;
}

function PhoneTrailingAction(props: {
  hasDigits: boolean;
  isValid: boolean;
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {props.hasDigits && !props.disabled ? (
        <button
          type="button"
          tabIndex={-1}
          onClick={props.onClear}
          aria-label="清空手机号"
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-pill text-ink-muted transition-colors hover:text-ink-primary"
        >
          <IconX size={14} stroke={1.5} />
        </button>
      ) : null}
      {props.isValid ? (
        <IconCheck size={15} stroke={1.5} aria-hidden="true" className="text-status-pass" />
      ) : null}
    </div>
  );
}

export function PhoneField({ value, onChange, disabled = false, externalError }: PhoneFieldProps) {
  const inputId = useId();
  const [touched, setTouched] = useState(false);
  const digits = extractChinaMobileDigits(value);
  const isValid = normalizeChinaPhone(digits) !== null;
  const errorMsg = resolvePhoneError(digits, touched, externalError);

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-xs tracking-wide text-ink-secondary">
        手机号
      </label>
      <div
        className={`group relative flex h-12 items-center border-b transition-colors duration-200 ${
          errorMsg ? "border-status-fail/70" : "border-strong hover:border-ink-primary/40"
        }`}
      >
        <span className="shrink-0 font-mono text-sm text-ink-secondary select-none">+86</span>
        <span aria-hidden="true" className="mx-3 h-4 w-px shrink-0 bg-hairline" />
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
          aria-invalid={Boolean(errorMsg)}
          className="h-full w-full min-w-0 bg-transparent font-mono text-base tracking-wider text-ink-primary tabular-nums placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-muted/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <PhoneTrailingAction
          hasDigits={digits.length > 0}
          isValid={isValid}
          disabled={disabled}
          onClear={() => onChange("")}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 -bottom-px h-[1.5px] origin-left scale-x-0 transition-transform duration-300 group-focus-within:scale-x-100 ${
            errorMsg ? "bg-status-fail" : "bg-accent-coral"
          }`}
        />
      </div>
      {errorMsg ? <p className="text-xs text-status-fail">{errorMsg}</p> : null}
    </div>
  );
}
