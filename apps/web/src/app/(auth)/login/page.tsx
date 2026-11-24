import type { Metadata } from "next";
import { AuthPortal } from "@/features/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "登录工作台 — KANON 卡农",
  description: "使用 +86 手机号登录 KANON 独立价值投资研究空间。",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  return <AuthPortal initialMode="login" nextPath={next} />;
}
