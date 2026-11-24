import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { RegisterForm } from "@/features/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "注册独立空间 — KANON 卡农",
  description: "使用 +86 中国大陆手机号 30 秒开通 KANON 独立加密投研空间。",
};

export default async function RegisterPage() {
  const auth = await getServerAuthContext();
  if (auth.user && !auth.isDemo) {
    redirect("/");
  }
  return <RegisterForm />;
}
