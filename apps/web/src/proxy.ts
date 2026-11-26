import { type NextRequest, NextResponse } from "next/server";

const KANON_SESSION_COOKIE = "kanon_session";
const PUBLIC_PATHS = new Set(["/login", "/register", "/welcome", "/icon.svg", "/favicon.ico"]);

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return true;
  return /\.[a-z0-9]{2,6}$/i.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicRoute(pathname)) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(KANON_SESSION_COOKIE)?.value);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/" || search) {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
