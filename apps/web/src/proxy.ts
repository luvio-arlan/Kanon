import { type NextRequest, NextResponse } from "next/server";

const KANON_SESSION_COOKIE = "kanon_session";

export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(KANON_SESSION_COOKIE)?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    if (request.nextUrl.search) {
      loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
