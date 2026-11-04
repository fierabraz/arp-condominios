import { NextResponse, type NextRequest } from "next/server";
import { decrypt, LOGIN, SESSION_COOKIE } from "@/lib/session";

export async function GET(request: NextRequest) {
  // Vuelve al ingreso del mismo tipo de sesión que se cierra.
  const sesion = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);
  const respuesta = NextResponse.redirect(new URL(sesion?.tipo === "RESIDENTE" ? LOGIN.RESIDENTE : LOGIN.ADMIN, request.nextUrl));
  respuesta.cookies.delete(SESSION_COOKIE);
  return respuesta;
}
