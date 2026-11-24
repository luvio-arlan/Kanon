"use client";

import { evaluatePasswordStrength, type PasswordStrengthResult } from "@kanon/core";
import {
  IconAlertCircle,
  IconCheck,
  IconCircleDashed,
  IconEye,
  IconEyeOff,
  IconLock,
} from "@tabler/icons-react";
import { type KeyboardEvent, useId, useState } from "react";

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
  showStrength?: boolean;
  matchTarget?: string;
  externalError?: string | null;
}

const STRENGTH_BAR_TONES = [
  "bg-status-fail",
  "bg-status-warn",
  "bg-accent-coral",
  "bg-status-pass",
] as const;

const STRENGTH_TEXT_TONES: Record<PasswordStrengthResult["level"], string> = {
  empty: "text-ink-muted",
  weak: "text-status-fail",
  fair: "text-status-warn",
  good: "text-accent-coral",
  strong: "text-status-pass",
};

function PasswordStrengthMeter({ strength }: { strength: PasswordStrengthResult }) {
  const activeColor =
    strength.score > 0 ? STRENGTH_BAR_TONES[Math.min(3, strength.score - 1)] : "bg-muted";

  return (
    <div className="space-y-2.5 rounded-control border border-hairline bg-canvas/75 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">密码安全强度</span>
        <span className={`font-medium ${STRENGTH_TEXT_TONES[strength.level]}`}>
          {strength.label}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={`h-1.5 rounded-pill transition-colors duration-200 ${
              strength.score >= seg ? activeColor : "bg-muted"
            }`}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 pt-0.5 sm:grid-cols-2">
        {strength.rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              rule.passed ? "text-status-pass" : "text-ink-muted"
            }`}
          >
            {rule.passed ? (
              <IconCheck size={13} stroke={1.5} className="shrink-0" />
            ) : (
              <IconCircleDashed size={13} stroke={1.5} className="shrink-0 opacity-70" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfirmMatchHint({
  value,
  matchTarget,
  touched,
}: {
  value: string;
  matchTarget: string;
  touched: boolean;
}) {
  if (value.length === 0) {
    if (!touched) return null;
    return (
      <div className="flex items-center gap-1.5 text-xs text-status-fail">
        <IconAlertCircle size={13} stroke={1.5} className="shrink-0" />
        <span>请再次输入密码以确认无误</span>
      </div>
    );
  }
  const matched = value === matchTarget;
  return (
    <div
      className={`flex items-center gap-1.5 text-xs ${
        matched ? "text-status-pass" : "text-status-fail"
      }`}
    >
      {matched ? (
        <IconCheck size={13} stroke={1.5} className="shrink-0" />
      ) : (
        <IconAlertCircle size={13} stroke={1.5} className="shrink-0" />
      )}
      <span>{matched ? "两次输入的密码一致" : "两次输入的密码不一致"}</span>
    </div>
  );
}

function resolveBorderTone(hasError: boolean, isSuccess: boolean): string {
  if (hasError) {
    return "border-status-fail/60 focus-within:border-status-fail focus-within:ring-status-fail-soft";
  }
  if (isSuccess) {
    return "border-status-pass/45 focus-within:border-accent-coral focus-within:ring-accent-coral-soft";
  }
  return "border-hairline hover:border-strong focus-within:border-accent-coral focus-within:ring-accent-coral-soft";
}

function PasswordInputControl(props: {
  inputId: string;
  value: string;
  visible: boolean;
  hasError: boolean;
  ringTone: string;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  onToggleVisible: () => void;
  onKeyState: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  return (
    <div
      className={`flex h-11 items-center rounded-control border bg-surface px-3 transition-[border-color,box-shadow] duration-150 focus-within:ring-2 ${props.ringTone}`}
    >
      <IconLock size={15} stroke={1.5} className="mr-2.5 shrink-0 text-ink-muted" />
      <input
        id={props.inputId}
        type={props.visible ? "text" : "password"}
        autoComplete={props.autoComplete ?? "current-password"}
        disabled={props.disabled}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyUp={props.onKeyState}
        onKeyDown={props.onKeyState}
        onBlur={props.onBlur}
        placeholder={props.placeholder ?? "请输入密码"}
        aria-invalid={props.hasError}
        className="h-full w-full min-w-0 bg-transparent text-sm tracking-wide text-ink-primary placeholder:tracking-normal placeholder:text-ink-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={props.onToggleVisible}
        aria-label={props.visible ? "隐藏密码" : "显示密码"}
        className="ml-2 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-muted hover:text-ink-primary"
      >
        {props.visible ? <IconEyeOff size={16} stroke={1.5} /> : <IconEye size={16} stroke={1.5} />}
      </button>
    </div>
  );
}

function PasswordFieldHeader({
  inputId,
  label,
  capsLockOn,
}: {
  inputId: string;
  label: string;
  capsLockOn: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={inputId} className="text-xs font-medium text-ink-primary">
        {label}
      </label>
      {capsLockOn ? (
        <span className="rounded-pill bg-status-warn-soft px-2 py-0.5 text-xs font-medium text-status-warn">
          已开启大写锁定
        </span>
      ) : null}
    </div>
  );
}

export function PasswordField(props: PasswordFieldProps) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [touched, setTouched] = useState(false);

  const strength = evaluatePasswordStrength(props.value);
  const isConfirm = props.matchTarget !== undefined;
  const mismatch = isConfirm && props.value.length > 0 && props.value !== props.matchTarget;
  const hasError = Boolean(props.externalError) || mismatch;
  const isSuccess =
    (isConfirm && props.value.length > 0 && props.value === props.matchTarget) ||
    Boolean(props.showStrength && strength.isValid);

  return (
    <div className="space-y-2">
      <PasswordFieldHeader inputId={inputId} label={props.label} capsLockOn={capsLockOn} />
      <PasswordInputControl
        inputId={inputId}
        value={props.value}
        visible={visible}
        hasError={hasError}
        ringTone={resolveBorderTone(hasError, isSuccess)}
        autoComplete={props.autoComplete}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={props.onChange}
        onToggleVisible={() => setVisible((prev) => !prev)}
        onKeyState={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
        onBlur={() => setTouched(true)}
      />
      {props.externalError ? (
        <div className="flex items-center gap-1.5 text-xs text-status-fail">
          <IconAlertCircle size={13} stroke={1.5} className="shrink-0" />
          <span>{props.externalError}</span>
        </div>
      ) : null}
      {props.showStrength ? <PasswordStrengthMeter strength={strength} /> : null}
      {isConfirm && props.matchTarget !== undefined ? (
        <ConfirmMatchHint value={props.value} matchTarget={props.matchTarget} touched={touched} />
      ) : null}
    </div>
  );
}
