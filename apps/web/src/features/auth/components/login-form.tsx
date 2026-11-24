"use client";

import { normalizeChinaPhone } from "@kanon/core";
import { IconArrowRight, IconLoader2 } from "@tabler/icons-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { loginAccount } from "../lib/auth-api";
import { PasswordField } from "./password-field";
import { PhoneField } from "./phone-field";

export interface LoginFormProps {
  nextPath?: string;
}

function resolveSafeRedirect(nextPath?: string): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/";
  return nextPath;
}

function LoginSubmitFooter(props: {
  serverError: string | null;
  submitting: boolean;
  canSubmit: boolean;
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
        className="kanon-cta-sheen group inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-ink-primary px-6 text-sm font-medium text-ink-inverse shadow-button-primary transition-[opacity,transform] duration-200 hover:opacity-92 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-35"
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
        <Link href="/register" className="text-ink-muted transition-colors hover:text-ink-primary">
          还没有账号？创建新账号
        </Link>
      </div>
    </div>
  );
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [phoneDigits, setPhoneDigits] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const canSubmit = normalizeChinaPhone(phoneDigits) !== null && password.length > 0 && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setServerError("请输入有效的 +86 手机号与密码。");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const res = await loginAccount({ phone: phoneDigits, password });
    if (!res.ok) {
      setSubmitting(false);
      setServerError(res.error);
      return;
    }
    toast.success(`欢迎回来，${res.data.user.displayName}`);
    window.location.assign(resolveSafeRedirect(nextPath));
  }

  return (
    <>
      <h1 className="text-3xl font-normal tracking-tight text-ink-primary">欢迎回到 KANON</h1>
      <form onSubmit={handleSubmit} className="space-y-7" noValidate>
        <PhoneField value={phoneDigits} onChange={setPhoneDigits} disabled={submitting} />
        <PasswordField
          label="密码"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="输入登录密码"
          disabled={submitting}
        />
        <LoginSubmitFooter
          serverError={serverError}
          submitting={submitting}
          canSubmit={canSubmit}
        />
      </form>
    </>
  );
}
