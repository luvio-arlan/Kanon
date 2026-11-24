"use client";

import { normalizeChinaPhone } from "@kanon/core";
import { Button } from "@kanon/ui";
import { IconAlertCircle, IconArrowRight, IconPlayerPlay } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { loginAccount } from "../lib/auth-api";
import { AuthShell } from "./auth-shell";
import { PasswordField } from "./password-field";
import { PhoneField } from "./phone-field";

export interface LoginFormProps {
  nextPath?: string;
}

function resolveSafeRedirect(nextPath?: string): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/";
  return nextPath;
}

function LoginFormActions(props: {
  serverError: string | null;
  submitting: boolean;
  canSubmit: boolean;
}) {
  return (
    <>
      {props.serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-control border border-status-fail/30 bg-status-fail-soft px-3.5 py-2.5 text-xs text-status-fail"
        >
          <IconAlertCircle size={15} stroke={1.5} className="mt-0.5 shrink-0" />
          <span>{props.serverError}</span>
        </div>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={props.submitting}
        disabled={!props.canSubmit}
        className="h-11 w-full"
      >
        <span>进入我的工作台</span>
        <IconArrowRight size={15} stroke={1.5} />
      </Button>
      <div className="flex items-center justify-between border-t border-hairline pt-4 text-xs">
        <Link
          href="/register"
          className="text-ink-secondary transition-colors hover:text-ink-primary"
        >
          还没有账号？免费注册 (+86)
        </Link>
        <Link
          href="/demo"
          className="inline-flex items-center gap-1 font-medium text-accent-coral transition-opacity hover:opacity-80"
        >
          <IconPlayerPlay size={12} stroke={1.5} />
          <span>免登沙盒体验</span>
        </Link>
      </div>
    </>
  );
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
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
    setSubmitting(false);
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    toast.success(`欢迎回来，${res.data.user.displayName}`);
    router.push(resolveSafeRedirect(nextPath));
    router.refresh();
  }

  return (
    <AuthShell
      mode="login"
      title="欢迎回到 KANON"
      subtitle="使用你的 +86 手机号与密码登录独立投研工作台。"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PhoneField value={phoneDigits} onChange={setPhoneDigits} disabled={submitting} />
        <PasswordField
          label="登录密码"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="请输入登录密码"
          disabled={submitting}
        />
        <LoginFormActions serverError={serverError} submitting={submitting} canSubmit={canSubmit} />
      </form>
    </AuthShell>
  );
}
