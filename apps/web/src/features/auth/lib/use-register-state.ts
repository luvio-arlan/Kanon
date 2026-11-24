"use client";

import { evaluatePasswordStrength, normalizeChinaPhone } from "@kanon/core";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { registerAccount } from "./auth-api";

export interface RegisterFormDraft {
  phoneDigits: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export function useRegisterState() {
  const [draft, setDraft] = useState<RegisterFormDraft>({
    phoneDigits: "",
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
    normalizeChinaPhone(draft.phoneDigits) !== null &&
    evaluatePasswordStrength(draft.password).isValid &&
    draft.password.length > 0 &&
    draft.password === draft.confirmPassword &&
    !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setServerError("请先完善有效的 +86 手机号与符合要求的密码。");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    const res = await registerAccount({
      phone: draft.phoneDigits,
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
