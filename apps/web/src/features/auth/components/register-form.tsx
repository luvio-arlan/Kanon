"use client";

import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import { useId } from "react";
import { useRegisterState } from "../lib/use-register-state";
import { PasswordField } from "./password-field";
import { PhoneField } from "./phone-field";

export interface RegisterFormProps {
  phoneDigits: string;
  onPhoneChange: (next: string) => void;
  onSwitchToLogin: () => void;
}

function DisplayNameLineField(props: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const nameId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={nameId} className="text-xs tracking-wide text-ink-secondary">
          研究员称呼
        </label>
        <span className="text-xs text-ink-muted">选填</span>
      </div>
      <div className="group relative flex h-12 items-center border-b border-strong transition-colors duration-200 hover:border-ink-primary/40">
        <input
          id={nameId}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          maxLength={24}
          disabled={props.disabled}
          placeholder="留空自动命名"
          className="h-full w-full min-w-0 bg-transparent text-base text-ink-primary placeholder:text-sm placeholder:text-ink-muted/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px h-[1.5px] origin-left scale-x-0 bg-accent-coral transition-transform duration-300 group-focus-within:scale-x-100"
        />
      </div>
    </div>
  );
}

function RegisterSubmitFooter(props: {
  serverError: string | null;
  submitting: boolean;
  canSubmit: boolean;
  onSwitchToLogin: () => void;
}) {
  return (
    <div className="space-y-5 pt-1">
      {props.serverError ? (
        <p role="alert" className="text-xs text-status-fail">
          {props.serverError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!props.canSubmit}
        className="kanon-cta-sheen group inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-ink-primary px-6 text-sm font-medium text-ink-inverse shadow-button-primary transition-[opacity,transform] duration-200 hover:opacity-92 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-35"
      >
        {props.submitting ? <IconLoader2 size={15} stroke={1.5} className="animate-spin" /> : null}
        <span>创建独立空间</span>
        {!props.submitting ? (
          <IconArrowRight
            size={15}
            stroke={1.5}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        ) : null}
      </button>
      <div className="flex items-center justify-center text-xs">
        <button
          type="button"
          onClick={props.onSwitchToLogin}
          className="cursor-pointer text-ink-muted transition-colors hover:text-ink-primary"
        >
          已有账号？直接登录
        </button>
      </div>
    </div>
  );
}

export function RegisterForm({ phoneDigits, onPhoneChange, onSwitchToLogin }: RegisterFormProps) {
  const { draft, updateField, submitting, serverError, canSubmit, onSubmit } =
    useRegisterState(phoneDigits);
  return (
    <>
      <h1 className="text-3xl font-normal tracking-tight text-ink-primary">开通独立投研空间</h1>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <PhoneField value={phoneDigits} onChange={onPhoneChange} disabled={submitting} />
        <DisplayNameLineField
          value={draft.displayName}
          onChange={(v) => updateField("displayName", v)}
          disabled={submitting}
        />
        <PasswordField
          label="设置密码"
          value={draft.password}
          onChange={(v) => updateField("password", v)}
          autoComplete="new-password"
          placeholder="8–24 位，含字母、数字与符号"
          disabled={submitting}
          showStrength
        />
        <PasswordField
          label="确认密码"
          value={draft.confirmPassword}
          onChange={(v) => updateField("confirmPassword", v)}
          autoComplete="new-password"
          placeholder="再次输入密码"
          disabled={submitting}
          matchTarget={draft.password}
        />
        <RegisterSubmitFooter
          serverError={serverError}
          submitting={submitting}
          canSubmit={canSubmit}
          onSwitchToLogin={onSwitchToLogin}
        />
      </form>
    </>
  );
}
