import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

// Revisión optimista: sin sesión válida se va al login. La autorización real
// se hace en cada página y acción mediante src/lib/auth.ts.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/salir")) return NextResponse.next();
  const esLogin = pathname.startsWith("/login");
  const sesion = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);

  if (!sesion && !esLogin) {
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  if (sesion && esLogin) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
