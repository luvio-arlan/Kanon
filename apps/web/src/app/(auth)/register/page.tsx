import type { Metadata } from "next";
import { AuthPortal } from "@/features/auth";

export const metadata: Metadata = {
  title: "注册独立空间 — KANON 卡农",
  description: "使用 +86 中国大陆手机号开通 KANON 独立投研空间。",
};

export default function RegisterPage() {
  return <AuthPortal initialMode="register" />;
}
