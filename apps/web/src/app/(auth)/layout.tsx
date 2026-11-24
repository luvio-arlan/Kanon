import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getServerAuthContext } from "@/app/api/_lib/auth-session";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const auth = await getServerAuthContext();
  if (auth.user) {
    redirect("/");
  }
  return children;
}
