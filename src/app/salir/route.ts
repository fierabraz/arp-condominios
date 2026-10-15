import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export function GET(request: NextRequest) {
  const respuesta = NextResponse.redirect(new URL("/login", request.nextUrl));
  respuesta.cookies.delete(SESSION_COOKIE);
  return respuesta;
}
