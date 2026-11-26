"use client";

import { normalizeChinaPhone } from "@kanon/core";
import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { loginAccount } from "../lib/auth-api";
import { PasswordField } from "./password-field";
import { PhoneField } from "./phone-field";

export interface LoginFormProps {
  nextPath?: string;
  phoneDigits: string;
  onPhoneChange: (next: string) => void;
  onSwitchToRegister: () => void;
}

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function resolveSafeRedirect(nextPath?: string): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/";
  if (nextPath.includes("\\") || hasControlChar(nextPath)) return "/";
  return nextPath;
}

function LoginSubmitFooter(props: {
  serverError: string | null;
  submitting: boolean;
  canSubmit: boolean;
  onSwitchToRegister: () => void;
}) {
  return (
    <div className="space-y-6 pt-2">
      {props.serverError ? (
        <p role="alert" className="text-xs text-status-fail">
          {props.serverError}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!props.canSubmit}
        className="kanon-cta-sheen group inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-ink-primary px-6 text-sm font-medium text-ink-inverse shadow-button-primary transition-[opacity,background-color] duration-200 hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {props.submitting ? <IconLoader2 size={15} stroke={1.5} className="animate-spin" /> : null}
        <span>进入工作台</span>
        {!props.submitting ? (
          <IconArrowRight
            size={15}
            stroke={1.5}
            className="transition-transform duration-200 group-hover:translate-x-0.5"
          />
        ) : null}
      </button>
      <div className="flex items-center justify-center pt-1 text-xs">
        <button
          type="button"
          onClick={props.onSwitchToRegister}
          className="cursor-pointer text-ink-muted transition-colors hover:text-ink-primary"
        >
          还没有账号？创建新账号
        </button>
      </div>
    </div>
  );
}

function useLoginSubmit(phoneDigits: string, nextPath?: string) {
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const canSubmit = normalizeChinaPhone(phoneDigits) !== null && password.length > 0 && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setServerError("请输入有效的 +86 手机号与密码。");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const res = await loginAccount({
      phone: phoneDigits,
      password,
      ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
    });
    if (!res.ok) {
      setSubmitting(false);
      if (res.code === "TOTP_REQUIRED" || res.code === "INVALID_TOTP") setNeedsTotp(true);
      setServerError(res.error);
      return;
    }
    toast.success(`欢迎回来，${res.data.user.displayName}`);
    window.location.assign(resolveSafeRedirect(nextPath));
  }

  return {
    password,
    setPassword,
    totpCode,
    setTotpCode,
    needsTotp,
    submitting,
    serverError,
    canSubmit,
    onSubmit,
  };
}

export function LoginForm(props: LoginFormProps) {
  const st = useLoginSubmit(props.phoneDigits, props.nextPath);

  return (
    <>
      <h1 className="text-3xl font-normal tracking-tight text-ink-primary">欢迎回到 KANON</h1>
      <form onSubmit={st.onSubmit} className="space-y-7" noValidate>
        <PhoneField
          value={props.phoneDigits}
          onChange={props.onPhoneChange}
          disabled={st.submitting}
        />
        <PasswordField
          label="密码"
          value={st.password}
          onChange={st.setPassword}
          autoComplete="current-password"
          placeholder="输入登录密码"
          disabled={st.submitting}
        />
        {st.needsTotp ? (
          <div className="space-y-2">
            <label htmlFor="login-totp" className="block text-xs font-medium text-ink-secondary">
              两步验证码 / 恢复码
            </label>
            <input
              id="login-totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={16}
              value={st.totpCode}
              onChange={(e) => st.setTotpCode(e.target.value.slice(0, 16))}
              placeholder="输入 6 位动态验证码"
              disabled={st.submitting}
              className="kanon-input-canvas w-full border-b border-hairline bg-transparent pb-2.5 font-mono text-base tracking-[0.18em] text-ink-primary outline-none transition-colors focus:border-accent-coral"
            />
          </div>
        ) : null}
        <LoginSubmitFooter
          serverError={st.serverError}
          submitting={st.submitting}
          canSubmit={st.canSubmit}
          onSwitchToRegister={props.onSwitchToRegister}
        />
      </form>
    </>
  );
}
