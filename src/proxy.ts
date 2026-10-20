import { NextResponse, type NextRequest } from "next/server";

// Cheap gate only (cookie present). Real verification happens server-side in requireSession().
export function proxy(req: NextRequest) {
  const has = req.cookies.has("ierp_session");
  const { pathname } = req.nextUrl;
  if (!has && pathname !== "/login") return NextResponse.redirect(new URL("/login", req.url));
  if (has && pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|svg|webp|ico)$).*)"] };
