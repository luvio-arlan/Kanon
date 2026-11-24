import type { PublicUser } from "@kanon/core";
import { getDemoUser, getKanonDb, getSessionUser } from "@kanon/core/db";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { jsonError } from "./http";

export const KANON_SESSION_COOKIE = "kanon_session";
export const KANON_DEMO_COOKIE = "kanon_demo";
const DEMO_TTL_SECONDS = 7 * 24 * 60 * 60;

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
  response.cookies.set(KANON_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    expires: expiresAt,
  });
  response.cookies.set(KANON_DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export function setDemoCookie(response: NextResponse): void {
  response.cookies.set(KANON_DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: DEMO_TTL_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(KANON_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(KANON_DEMO_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge: 0,
  });
}

export async function getRawSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(KANON_SESSION_COOKIE)?.value ?? null;
}

export async function getServerAuthContext(): Promise<{
  user: PublicUser | null;
  isDemo: boolean;
}> {
  const store = await cookies();
  const token = store.get(KANON_SESSION_COOKIE)?.value;
  const db = await getKanonDb();

  if (token) {
    const user = await getSessionUser(db, token);
    if (user) {
      return { user, isDemo: false };
    }
  }

  if (store.get(KANON_DEMO_COOKIE)?.value === "1") {
    const demoUser = await getDemoUser(db);
    return { user: demoUser, isDemo: true };
  }

  return { user: null, isDemo: false };
}

export async function requireWorkspaceContext(
  startedAt: number,
): Promise<
  { ok: true; user: PublicUser; isDemo: boolean } | { ok: false; response: NextResponse }
> {
  const ctx = await getServerAuthContext();
  if (!ctx.user) {
    return {
      ok: false,
      response: jsonError("请先登录账号或开启体验模式。", 401, startedAt, "UNAUTHORIZED"),
    };
  }
  return { ok: true, user: ctx.user, isDemo: ctx.isDemo };
}
