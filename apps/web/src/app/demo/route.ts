import { NextResponse } from "next/server";
import { getServerAuthContext, setDemoCookie } from "../api/_lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const current = await getServerAuthContext();
  const targetUrl = new URL("/", request.url);
  const response = NextResponse.redirect(targetUrl);
  if (!current.user || current.isDemo) {
    setDemoCookie(response);
  }
  return response;
}
