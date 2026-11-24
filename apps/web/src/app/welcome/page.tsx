import type { Metadata } from "next";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";
import { LandingShell } from "@/features/landing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "KANON 卡农 — 在噪音里，谱出自己的确定性",
  description: "面向深度个人价值投资者与买方投研团队的独立投资逻辑操作系统。",
};

export default async function WelcomePage() {
  const auth = await getServerAuthContext();
  return <LandingShell currentUser={auth.user} isDemo={auth.isDemo} />;
}
