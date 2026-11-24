"use client";

import { evaluatePasswordStrength, normalizeChinaPhone } from "@kanon/core";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { registerAccount } from "./auth-api";

export interface RegisterFormDraft {
  displayName: string;
  password: string;
  confirmPassword: string;
}

export function useRegisterState(phoneDigits: string) {
  const [draft, setDraft] = useState<RegisterFormDraft>({
    displayName: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const updateField = <K extends keyof RegisterFormDraft>(key: K, val: RegisterFormDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  const canSubmit =
    normalizeChinaPhone(phoneDigits) !== null &&
    evaluatePasswordStrength(draft.password).isValid &&
    draft.password.length > 0 &&
    draft.password === draft.confirmPassword &&
    !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setServerError("请填写有效 +86 手机号，并设置含字母、数字与符号的 8–24 位密码。");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const res = await registerAccount({
      phone: phoneDigits,
      displayName: draft.displayName.trim() || undefined,
      password: draft.password,
      confirmPassword: draft.confirmPassword,
      seedStarterWorkspace: false,
    });
    if (!res.ok) {
      setSubmitting(false);
      setServerError(res.error);
      return;
    }
    toast.success(`欢迎加入 KANON，${res.data.user.displayName}`);
    window.location.assign(res.data.redirectTo);
  }

  return { draft, updateField, submitting, serverError, canSubmit, onSubmit };
}
