import "server-only";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { LIMITE, minutosDeBloqueo } from "@/lib/limite-ingreso";

/** IP de quien hace la petición (en Vercel viene en x-forwarded-for). */
export async function ipCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

/** Minutos de bloqueo vigentes para ese correo o esa conexión; 0 si puede intentar. */
export async function bloqueoVigente(correo: string, ip: string | null) {
  const desde = new Date(Date.now() - LIMITE.minutos * 60_000);
  const [porCorreo, porIp] = await Promise.all([
    db.intentoIngreso.findMany({ where: { correo, creadoEn: { gte: desde } }, select: { exitoso: true, creadoEn: true } }),
    ip
      ? db.intentoIngreso.findMany({ where: { ip, creadoEn: { gte: desde } }, select: { exitoso: true, creadoEn: true } })
      : [],
  ]);
  return Math.max(minutosDeBloqueo(porCorreo, LIMITE.fallosPorCorreo), minutosDeBloqueo(porIp, LIMITE.fallosPorIp));
}

export async function anotarIntento(correo: string, ip: string | null, exitoso: boolean) {
  await db.intentoIngreso.create({ data: { correo, ip, exitoso } });
  // Limpieza: los intentos de más de un día ya no sirven.
  if (Math.random() < 0.05) {
    await db.intentoIngreso.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - 86_400_000) } } });
  }
}
