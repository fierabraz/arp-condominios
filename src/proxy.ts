import { NextResponse, type NextRequest } from "next/server";
import { decrypt, LOGIN, SESSION_COOKIE } from "@/lib/session";

// Revisión optimista: sin sesión válida se va al ingreso que corresponde, y cada tipo de
// sesión queda en su parte del sitio. La autorización real se hace en cada página y
// acción mediante src/lib/auth.ts.

const PUBLICAS = ["/login", "/recuperar", "/invitacion", "/salir"];
// Lo único que ve una sesión de residente: su cuenta y los documentos que se abren desde ella.
const DE_RESIDENTE = ["/mi-cuenta", "/avisos", "/rendiciones", "/publicaciones"];

const empieza = (ruta: string, prefijos: string[]) => prefijos.some((p) => ruta === p || ruta.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (empieza(pathname, ["/salir", "/recuperar", "/invitacion"])) return NextResponse.next();
  const esLogin = empieza(pathname, ["/login"]);
  const sesion = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);
  const ir = (ruta: string) => NextResponse.redirect(new URL(ruta, request.nextUrl));

  if (!sesion) {
    if (esLogin || empieza(pathname, PUBLICAS)) return NextResponse.next();
    return ir(empieza(pathname, ["/mi-cuenta"]) ? LOGIN.RESIDENTE : LOGIN.ADMIN);
  }
  const inicio = sesion.tipo === "RESIDENTE" ? "/mi-cuenta" : "/";
  if (esLogin) return ir(inicio);
  if (sesion.tipo === "RESIDENTE" && !empieza(pathname, DE_RESIDENTE)) return ir(inicio);
  if (sesion.tipo === "ADMIN" && empieza(pathname, ["/mi-cuenta"])) return ir(inicio);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
