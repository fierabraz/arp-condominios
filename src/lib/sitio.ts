import "server-only";
import { headers } from "next/headers";

/**
 * Dirección del sitio para los enlaces que se envían (recuperación, invitaciones). En Vercel
 * sale de sus variables, no del encabezado Host, que quien hace la petición podría falsear
 * para robar el enlace.
 */
export async function origenDelSitio() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  const vercel = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return `http://${(await headers()).get("host") ?? "localhost:3000"}`;
}
