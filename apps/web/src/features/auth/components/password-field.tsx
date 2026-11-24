"use client";

import {
  evaluatePasswordStrength,
  PASSWORD_MAX_LENGTH,
  type PasswordStrengthResult,
} from "@kanon/core";
import { KANON_TRANSITION_FAST } from "@kanon/ui";
import { IconCheck, IconEye, IconEyeOff } from "@tabler/icons-react";
import { AnimatePresence, motion } from "framer-motion";
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

function PasswordStrengthRail({ strength }: { strength: PasswordStrengthResult }) {
  const activeColor =
    strength.score > 0 ? STRENGTH_BAR_TONES[Math.min(3, strength.score - 1)] : "bg-hairline";
  const nextMissing = strength.rules.find((r) => r.required && !r.passed);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={KANON_TRANSITION_FAST}
      className="overflow-hidden pt-1"
    >
      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={`h-[2px] rounded-pill transition-colors duration-300 ${
              strength.score >= seg ? activeColor : "bg-hairline"
            }`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-ink-muted">
          {nextMissing ? `需满足：${nextMissing.label}` : "密码强度已达标"}
        </span>
        <span className={`font-medium ${STRENGTH_TEXT_TONES[strength.level]}`}>
          {strength.label}
        </span>
      </div>
    </motion.div>
  );
}

function PasswordTrailingSlot(props: {
  visible: boolean;
  isMatched: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div className="ml-2 flex shrink-0 items-center gap-1.5">
      {props.isMatched ? (
        <IconCheck size={15} stroke={1.5} aria-hidden="true" className="text-status-pass" />
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        onClick={props.onToggleVisible}
        aria-label={props.visible ? "隐藏密码" : "显示密码"}
        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-pill text-ink-muted transition-colors hover:text-ink-primary"
      >
        {props.visible ? <IconEyeOff size={16} stroke={1.5} /> : <IconEye size={16} stroke={1.5} />}
      </button>
    </div>
  );
}

interface PasswordInputLineProps {
  inputId: string;
  value: string;
  visible: boolean;
  hasError: boolean;
  isMatched: boolean;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
  placeholder?: string;
  onChange: (next: string) => void;
  onToggleVisible: () => void;
  onKeyState: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}

function PasswordInputLine(props: PasswordInputLineProps) {
  return (
    <div
      className={`group relative flex h-12 items-center border-b transition-colors duration-200 ${
        props.hasError ? "border-status-fail/70" : "border-strong hover:border-ink-primary/40"
      }`}
    >
      <input
        id={props.inputId}
        type={props.visible ? "text" : "password"}
        autoComplete={props.autoComplete ?? "current-password"}
        disabled={props.disabled}
        maxLength={PASSWORD_MAX_LENGTH}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.slice(0, PASSWORD_MAX_LENGTH))}
        onKeyUp={props.onKeyState}
        onKeyDown={props.onKeyState}
        onBlur={props.onBlur}
        placeholder={props.placeholder ?? "输入密码"}
        aria-invalid={props.hasError}
        className="kanon-input-canvas h-full w-full min-w-0 bg-transparent text-base tracking-wide text-ink-primary placeholder:text-sm placeholder:tracking-normal placeholder:text-ink-muted/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <PasswordTrailingSlot
        visible={props.visible}
        isMatched={props.isMatched}
        onToggleVisible={props.onToggleVisible}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 -bottom-px h-[1.5px] origin-left scale-x-0 transition-transform duration-300 group-focus-within:scale-x-100 ${
          props.hasError ? "bg-status-fail" : "bg-accent-coral"
        }`}
      />
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
  const isMatched = isConfirm && props.value.length > 0 && props.value === props.matchTarget;
  const confirmError = mismatch
    ? "两次输入的密码不一致"
    : isConfirm && touched && props.value.length === 0
      ? "请再次确认密码"
      : null;
  const errorText = props.externalError ?? confirmError;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-xs tracking-wide text-ink-secondary">
          {props.label}
        </label>
        {capsLockOn ? <span className="text-xs text-status-warn">大写锁定</span> : null}
      </div>
      <PasswordInputLine
        inputId={inputId}
        value={props.value}
        visible={visible}
        hasError={Boolean(errorText)}
        isMatched={isMatched}
        autoComplete={props.autoComplete}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={props.onChange}
        onToggleVisible={() => setVisible((prev) => !prev)}
        onKeyState={(e) => setCapsLockOn(e.getModifierState("CapsLock"))}
        onBlur={() => setTouched(true)}
      />
      {errorText ? <p className="text-xs text-status-fail">{errorText}</p> : null}
      <AnimatePresence initial={false}>
        {props.showStrength && props.value.length > 0 ? (
          <PasswordStrengthRail strength={strength} />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
