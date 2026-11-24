import type { PublicUser } from "@kanon/core";
import { getKanonDb, getSessionUser } from "@kanon/core/db";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { jsonError } from "./http";

export const KANON_SESSION_COOKIE = "kanon_session";

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
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(KANON_SESSION_COOKIE, "", {
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
}> {
  const store = await cookies();
  const token = store.get(KANON_SESSION_COOKIE)?.value;

  if (!token) {
    return { user: null };
  }

  const db = await getKanonDb();
  const user = await getSessionUser(db, token);
  if (user) {
    return { user };
  }

  return { user: null };
}

export async function requireWorkspaceContext(
  startedAt: number,
): Promise<{ ok: true; user: PublicUser } | { ok: false; response: NextResponse }> {
  const ctx = await getServerAuthContext();
  if (!ctx.user) {
    return {
      ok: false,
      response: jsonError("请先登录账号。", 401, startedAt, "UNAUTHORIZED"),
    };
  }
  return { ok: true, user: ctx.user };
}
