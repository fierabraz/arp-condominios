// Límite de intentos de ingreso. Funciones puras para poder probarlas; la consulta
// a la base de datos está en src/lib/intentos.ts.

export const LIMITE = {
  /** Fallos seguidos permitidos para un mismo correo antes de bloquearlo. */
  fallosPorCorreo: 5,
  /** Fallos permitidos desde una misma conexión (varios correos distintos). */
  fallosPorIp: 20,
  /** Minutos que dura el bloqueo y que se miran hacia atrás. */
  minutos: 15,
};

export type Intento = { exitoso: boolean; creadoEn: Date };

/** Fallos dentro de la ventana, contando solo los posteriores al último ingreso correcto. */
export function fallosRecientes(intentos: Intento[], ahora = new Date()) {
  const desde = ahora.getTime() - LIMITE.minutos * 60_000;
  const ultimoExito = Math.max(0, ...intentos.filter((i) => i.exitoso).map((i) => i.creadoEn.getTime()));
  return intentos.filter((i) => !i.exitoso && i.creadoEn.getTime() >= desde && i.creadoEn.getTime() > ultimoExito);
}

/** Minutos que faltan para poder intentar de nuevo, o 0 si no está bloqueado. */
export function minutosDeBloqueo(intentos: Intento[], maximo: number, ahora = new Date()) {
  const fallos = fallosRecientes(intentos, ahora);
  if (fallos.length < maximo) return 0;
  // El bloqueo termina cuando el fallo que completó el máximo sale de la ventana.
  const ordenados = fallos.map((f) => f.creadoEn.getTime()).sort((a, b) => b - a);
  const clave = ordenados[maximo - 1];
  const fin = clave + LIMITE.minutos * 60_000;
  return Math.max(1, Math.ceil((fin - ahora.getTime()) / 60_000));
}
