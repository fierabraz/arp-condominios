// VER-001 · Verificación automática de transferencias informadas con la cartola. Reglas puras
// (sin base de datos) para poder probarlas.
//
// Al cargar una cartola se compara cada transferencia informada pendiente con los abonos libres:
// - VERIFICADA: monto, fecha y número de operación coinciden, con UN solo abono y ese abono no
//   calza con otra transferencia. Solo en ese caso se registra el pago sin intervención.
// - POR_CONFIRMAR: coinciden algunos datos (mismo monto, fecha a 1 o 2 días, falta el número de
//   operación...). Queda «En revisión» con el abono sugerido para confirmarlo con un clic.
// - CON_DIFERENCIAS: el abono parece ser este pago (mismo número de operación o la glosa nombra
//   la unidad, fecha cercana), pero el monto no calza. Queda «En revisión» para revisarlo a mano.
// Nunca se rechaza sola una transferencia: «Rechazado» lo decide siempre una persona.
// Un abono se sugiere o se usa para UNA sola transferencia.

import { nombraUnidad } from "@/lib/conciliacion";
import { soloDigitos } from "@/lib/pagos";

export type TransferenciaPendiente = {
  id: string;
  unidadId: string;
  unidad: string; // número de la unidad
  fecha: Date;
  monto: number; // en unidades mínimas (pesos)
  operacion: string | null;
};

export type AbonoLibre = {
  id: string;
  fecha: Date;
  restante: number; // lo que queda sin conciliar, en unidades mínimas
  descripcion: string | null;
  referencia: string | null;
  contraparte: string | null;
};

export type ResultadoAuto = "VERIFICADA" | "POR_CONFIRMAR" | "CON_DIFERENCIAS";

export type Decision = {
  transferenciaId: string;
  movimientoId: string;
  resultado: ResultadoAuto;
  motivos: string[];
};

export const RESULTADOS_AUTO: Record<ResultadoAuto, { texto: string; tono: "exito" | "alerta" | "peligro"; ayuda: string }> = {
  VERIFICADA: {
    texto: "Verificada sola",
    tono: "exito",
    ayuda: "Monto, fecha y número de operación coinciden con un abono de la cartola.",
  },
  POR_CONFIRMAR: {
    texto: "Por confirmar",
    tono: "alerta",
    ayuda: "Coinciden algunos datos. Revisa el abono sugerido y confírmalo con un clic.",
  },
  CON_DIFERENCIAS: {
    texto: "Con diferencias",
    tono: "peligro",
    ayuda: "El abono parece ser este pago, pero el monto no calza. Revísala a mano.",
  },
};

/** Días de diferencia que todavía se sugieren por fecha (más allá, solo con n° de operación). */
export const DIAS_CERCA = 2;
/** Con el mismo número de operación se acepta una diferencia de fecha mayor (fin de semana, feriados). */
export const DIAS_CON_OPERACION = 7;

const diasEntre = (a: Date, b: Date) => Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);

type Nivel = "EXACTA" | "PARCIAL" | "DIFERENCIA";
type Par = { t: TransferenciaPendiente; a: AbonoLibre; nivel: Nivel; dias: number; operacion: "coincide" | "falta" | "distinta"; motivos: string[] };

/** Compara una transferencia con un abono. null = no tienen relación. */
export function compararConAbono(t: TransferenciaPendiente, a: AbonoLibre): Omit<Par, "t" | "a"> | null {
  if (a.restante <= 0) return null;
  const dias = diasEntre(t.fecha, a.fecha);
  if (dias > DIAS_CON_OPERACION) return null;
  const opT = t.operacion ? soloDigitos(t.operacion) : "";
  const textoCartola = soloDigitos(`${a.referencia ?? ""} ${a.descripcion ?? ""}`);
  const operacion: Par["operacion"] =
    opT.length < 4 || textoCartola.length === 0 ? "falta" : textoCartola.includes(opT) ? "coincide" : "distinta";
  const montoIgual = t.monto === a.restante;
  const glosa = `${a.descripcion ?? ""} ${a.referencia ?? ""} ${a.contraparte ?? ""}`;
  const nombra = nombraUnidad(glosa, t.unidad);

  const motivos: string[] = [];
  motivos.push(montoIgual ? "mismo monto" : a.restante > t.monto ? "el abono es mayor que lo informado" : "el abono es menor que lo informado");
  motivos.push(dias === 0 ? "misma fecha" : `${dias} día${dias === 1 ? "" : "s"} de diferencia en la fecha`);
  motivos.push(
    operacion === "coincide"
      ? "mismo número de operación"
      : operacion === "distinta"
        ? "el número de operación informado no aparece en la cartola"
        : opT.length < 4
          ? "el residente no informó número de operación"
          : "la cartola no trae número de operación",
  );
  if (nombra) motivos.push(`la glosa nombra la unidad ${t.unidad}`);

  let nivel: Nivel | null = null;
  if (montoIgual && dias === 0 && operacion === "coincide") nivel = "EXACTA";
  else if (montoIgual && operacion === "coincide") nivel = "PARCIAL"; // fecha distinta, hasta 7 días
  else if (montoIgual && dias <= DIAS_CERCA && (operacion === "falta" || dias === 0 || nombra)) nivel = "PARCIAL";
  else if (!montoIgual && (operacion === "coincide" || (nombra && dias <= DIAS_CERCA))) nivel = "DIFERENCIA";
  if (!nivel) return null;
  return { nivel, dias, operacion, motivos };
}

const rango = (p: Par) =>
  (p.nivel === "EXACTA" ? 0 : p.nivel === "PARCIAL" ? 1000 : 2000) + (p.operacion === "coincide" ? 0 : 100) + p.dias * 10;

/**
 * Decide qué hacer con cada transferencia pendiente frente a los abonos libres.
 * - Las coincidencias exactas e inequívocas (1 transferencia ↔ 1 abono) quedan VERIFICADAS.
 * - El resto se reparte de la mejor a la peor coincidencia, sin repetir abonos ni transferencias.
 * - Las transferencias sin ninguna coincidencia no aparecen: siguen como estaban.
 * Devuelve también los abonos que no quedaron asociados a ninguna transferencia.
 */
export function decidirVerificacion(transferencias: TransferenciaPendiente[], abonos: AbonoLibre[]) {
  const pares: Par[] = [];
  for (const t of transferencias) {
    for (const a of abonos) {
      const c = compararConAbono(t, a);
      if (c) pares.push({ t, a, ...c });
    }
  }
  const exactasDeT = new Map<string, number>();
  const exactasDeA = new Map<string, number>();
  const candidatosDeT = new Map<string, number>();
  const candidatosDeA = new Map<string, number>();
  const suma = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const p of pares) {
    suma(candidatosDeT, p.t.id);
    suma(candidatosDeA, p.a.id);
    if (p.nivel === "EXACTA") {
      suma(exactasDeT, p.t.id);
      suma(exactasDeA, p.a.id);
    }
  }

  const decisiones: Decision[] = [];
  const usadasT = new Set<string>();
  const usadosA = new Set<string>();

  // 1. Exactas sin ninguna duda: verificadas.
  for (const p of pares) {
    if (p.nivel !== "EXACTA" || exactasDeT.get(p.t.id) !== 1 || exactasDeA.get(p.a.id) !== 1) continue;
    decisiones.push({ transferenciaId: p.t.id, movimientoId: p.a.id, resultado: "VERIFICADA", motivos: p.motivos });
    usadasT.add(p.t.id);
    usadosA.add(p.a.id);
  }

  // 2. Lo demás: sugerencias, de la mejor a la peor, sin repetir.
  const resto = pares.filter((p) => !usadasT.has(p.t.id) && !usadosA.has(p.a.id)).sort((x, y) => rango(x) - rango(y) || x.a.fecha.getTime() - y.a.fecha.getTime());
  for (const p of resto) {
    if (usadasT.has(p.t.id) || usadosA.has(p.a.id)) continue;
    const motivos = [...p.motivos];
    if (p.nivel === "EXACTA") motivos.push("hay más de un abono o más de una transferencia con los mismos datos");
    else if ((candidatosDeT.get(p.t.id) ?? 0) > 1) motivos.push("hay otros abonos parecidos: revisa que sea este");
    else if ((candidatosDeA.get(p.a.id) ?? 0) > 1) motivos.push("este abono también se parece a otra transferencia");
    decisiones.push({
      transferenciaId: p.t.id,
      movimientoId: p.a.id,
      resultado: p.nivel === "DIFERENCIA" ? "CON_DIFERENCIAS" : "POR_CONFIRMAR",
      motivos,
    });
    usadasT.add(p.t.id);
    usadosA.add(p.a.id);
  }

  const libres = abonos.filter((a) => !usadosA.has(a.id) && a.restante > 0).map((a) => a.id);
  return { decisiones, abonosSinTransferencia: libres };
}

/** Texto corto de los motivos para guardar y mostrar. */
export const textoMotivos = (motivos: string[]) => {
  const t = motivos.join("; ");
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 500);
};

/** Lo que ve la administración al terminar de cargar una cartola. */
export type ResumenVerificacion =
  | { activa: false }
  | {
      activa: true;
      verificacionId?: string;
      revisadas: number;
      verificadas: number;
      porConfirmar: number;
      conDiferencias: number;
      /** Abonos (de esta cartola) sin ninguna transferencia informada. */
      sinTransferencia: { id: string; fecha: string; monto: number; glosa: string }[];
      totalSinTransferencia: number;
      /** Falló algo técnico: los movimientos sí quedaron importados. */
      error?: string;
    };
