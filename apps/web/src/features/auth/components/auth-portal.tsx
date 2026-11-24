"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useState } from "react";
import { type AuthMode, AuthShell } from "./auth-shell";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export interface AuthPortalProps {
  initialMode: AuthMode;
  nextPath?: string;
}

const AUTH_PANEL_VARIANTS: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir * 18,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -14,
    transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] },
  }),
};

function syncBrowserAuthUrl(nextMode: AuthMode, nextPath?: string) {
  if (typeof window === "undefined") return;
  const search = nextMode === "login" && nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
  const target = `${nextMode === "register" ? "/register" : "/login"}${search}`;
  window.history.replaceState(null, "", target);
  document.title =
    nextMode === "register" ? "注册独立空间 — KANON 卡农" : "登录工作台 — KANON 卡农";
}

export function AuthPortal({ initialMode, nextPath }: AuthPortalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [phoneDigits, setPhoneDigits] = useState("");

  function handleModeChange(next: AuthMode) {
    if (next === mode) return;
    setDirection(next === "register" ? 1 : -1);
    setMode(next);
    syncBrowserAuthUrl(next, nextPath);
  }

  return (
    <AuthShell mode={mode} onModeChange={handleModeChange}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={mode}
          custom={direction}
          variants={AUTH_PANEL_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          className="space-y-8"
        >
          {mode === "login" ? (
            <LoginForm
              nextPath={nextPath}
              phoneDigits={phoneDigits}
              onPhoneChange={setPhoneDigits}
              onSwitchToRegister={() => handleModeChange("register")}
            />
          ) : (
            <RegisterForm
              phoneDigits={phoneDigits}
              onPhoneChange={setPhoneDigits}
              onSwitchToLogin={() => handleModeChange("login")}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </AuthShell>
  );
}
