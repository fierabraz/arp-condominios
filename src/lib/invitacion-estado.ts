// Estado del acceso a la app de una persona, y el enlace de WhatsApp para invitarla.
// Puro (sin base de datos) para poder probarlo.

export type EstadoAcceso = "SIN_CORREO" | "SIN_CUENTA" | "INVITADA" | "VENCIDA" | "ACTIVA" | "DESACTIVADA";

export const ETIQUETAS_ACCESO: Record<EstadoAcceso, { texto: string; tono: "exito" | "alerta" | "peligro" | "neutro" | "marca" }> = {
  SIN_CORREO: { texto: "Sin correo", tono: "neutro" },
  SIN_CUENTA: { texto: "Sin invitar", tono: "neutro" },
  INVITADA: { texto: "Invitación enviada", tono: "marca" },
  VENCIDA: { texto: "Invitación vencida", tono: "alerta" },
  ACTIVA: { texto: "Con acceso", tono: "exito" },
  DESACTIVADA: { texto: "Cuenta desactivada", tono: "peligro" },
};

type Cuenta = {
  activo: boolean;
  claveActualizadaEn: Date | null;
  ultimoIngresoEn: Date | null;
  invitaciones: { expiraEn: Date; usadoEn: Date | null }[];
};

/**
 * Una cuenta creada por invitación queda pendiente hasta que la persona crea su contraseña.
 * Las cuentas creadas a mano con contraseña (en Permisos) cuentan como activas.
 */
export function estadoAcceso(correo: string | null, cuenta: Cuenta | null, ahora = new Date()): EstadoAcceso {
  if (cuenta) {
    if (!cuenta.activo) return "DESACTIVADA";
    const pendiente = !cuenta.claveActualizadaEn && !cuenta.ultimoIngresoEn && cuenta.invitaciones.length > 0;
    if (!pendiente) return "ACTIVA";
    return cuenta.invitaciones.some((i) => !i.usadoEn && i.expiraEn > ahora) ? "INVITADA" : "VENCIDA";
  }
  return correo ? "SIN_CUENTA" : "SIN_CORREO";
}

/** Se puede (re)enviar invitación mientras la persona no haya creado su contraseña. */
export const puedeInvitar = (estado: EstadoAcceso) => estado === "SIN_CUENTA" || estado === "INVITADA" || estado === "VENCIDA";

/**
 * Número para wa.me: solo dígitos y con código de país. Los celulares chilenos de 9 dígitos
 * (9 1234 5678) reciben el 56 delante. Sin número válido devuelve undefined y WhatsApp deja
 * elegir el contacto.
 */
export function numeroWhatsapp(telefono?: string | null) {
  let d = (telefono ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) d = `56${d}`;
  if (d.length === 8) d = `569${d}`;
  return d.length >= 10 && d.length <= 15 ? d : undefined;
}

export function mensajeInvitacion(nombre: string, propiedad: string, enlace: string, dias: number) {
  const primer = nombre.split(" ")[0];
  return `Hola, ${primer}. Te invitamos a la app de ${propiedad}, donde puedes ver tus gastos comunes, tus pagos, los avisos y las votaciones. Crea tu contraseña con este enlace (sirve una vez y por ${dias} días): ${enlace}`;
}

export function enlaceWhatsapp(telefono: string | null | undefined, mensaje: string) {
  const numero = numeroWhatsapp(telefono);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensaje)}`;
}
