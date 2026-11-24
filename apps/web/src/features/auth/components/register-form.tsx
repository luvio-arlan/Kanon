"use client";

import { Button, Input } from "@kanon/ui";
import {
  IconAlertCircle,
  IconArrowRight,
  IconPlayerPlay,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import Link from "next/link";
import { useId } from "react";
import { useRegisterState } from "../lib/use-register-state";
import { AuthShell } from "./auth-shell";
import { PasswordField } from "./password-field";
import { PhoneField } from "./phone-field";

function DisplayNameField(props: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const nameId = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={nameId} className="text-xs font-medium text-ink-primary">
          研究员称呼
        </label>
        <span className="text-xs text-ink-muted">选填</span>
      </div>
      <div className="relative">
        <IconUser
          size={15}
          stroke={1.5}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <Input
          id={nameId}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          maxLength={24}
          disabled={props.disabled}
          placeholder="例如：阿伦 / 长期主义者（留空将自动命名）"
          className="h-11 pl-9"
        />
      </div>
    </div>
  );
}

function StarterTemplateToggle(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-control border border-hairline bg-titanium-subtle/60 p-3.5 transition-colors hover:border-strong"
    >
      <input
        id={id}
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent-coral"
      />
      <span className="space-y-0.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-primary">
          <IconSparkles size={13} stroke={1.5} className="text-accent-coral" />
          预置 NVDA / MU 示例研究模板（推荐）
        </span>
        <span className="block leading-relaxed text-ink-secondary">
          注册后即在你的私有空间生成可自由编辑/删除的示例标的，零门槛体验 5 步研究画布。
        </span>
      </span>
    </label>
  );
}

function RegisterPasswordPair(props: {
  password: string;
  confirmPassword: string;
  disabled: boolean;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
}) {
  return (
    <>
      <PasswordField
        label="设置登录密码"
        value={props.password}
        onChange={props.onPasswordChange}
        autoComplete="new-password"
        placeholder="8 位以上，需包含字母与数字"
        disabled={props.disabled}
        showStrength
      />
      <PasswordField
        label="确认登录密码"
        value={props.confirmPassword}
        onChange={props.onConfirmChange}
        autoComplete="new-password"
        placeholder="再次输入密码以确认"
        disabled={props.disabled}
        matchTarget={props.password}
      />
    </>
  );
}

function RegisterFormActions(props: {
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
        <span>创建我的 KANON 账号</span>
        <IconArrowRight size={15} stroke={1.5} />
      </Button>
      <div className="flex items-center justify-between border-t border-hairline pt-4 text-xs">
        <Link href="/login" className="text-ink-secondary transition-colors hover:text-ink-primary">
          已有账号？直接登录
        </Link>
        <Link
          href="/demo"
          className="inline-flex items-center gap-1 font-medium text-accent-coral transition-opacity hover:opacity-80"
        >
          <IconPlayerPlay size={12} stroke={1.5} />
          <span>先免登体验</span>
        </Link>
      </div>
    </>
  );
}

export function RegisterForm() {
  const { draft, updateField, submitting, serverError, canSubmit, onSubmit } = useRegisterState();
  return (
    <AuthShell
      mode="register"
      title="开通你的独立投研空间"
      subtitle="使用 +86 手机号 30 秒注册，数据按账号完全隔离。"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <PhoneField
          value={draft.phoneDigits}
          onChange={(v) => updateField("phoneDigits", v)}
          disabled={submitting}
        />
        <DisplayNameField
          value={draft.displayName}
          onChange={(v) => updateField("displayName", v)}
          disabled={submitting}
        />
        <RegisterPasswordPair
          password={draft.password}
          confirmPassword={draft.confirmPassword}
          disabled={submitting}
          onPasswordChange={(v) => updateField("password", v)}
          onConfirmChange={(v) => updateField("confirmPassword", v)}
        />
        <StarterTemplateToggle
          checked={draft.seedStarter}
          onChange={(v) => updateField("seedStarter", v)}
          disabled={submitting}
        />
        <RegisterFormActions
          serverError={serverError}
          submitting={submitting}
          canSubmit={canSubmit}
        />
      </form>
    </AuthShell>
  );
}
