import { type NextRequest, NextResponse } from "next/server";

const KANON_SESSION_COOKIE = "kanon_session";

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(KANON_SESSION_COOKIE)?.value);
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
