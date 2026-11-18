// FIN-COMP · Entrega A · Conciliación de ingresos (FIN-003.2). Reglas puras (sin base de datos):
// cómo repartir un pago entre los avisos de la unidad y qué registros podrían corresponder a un
// abono de la cartola. Todo aquí PROPONE; la administración siempre revisa y confirma.

import { aplicarPago } from "@/lib/cobro";
import { soloDigitos } from "@/lib/pagos";

// ---------------------------------------------------------------------------
// Distribución de un pago entre avisos

export type AvisoConSaldo = { id: string; saldo: number; vencimiento: Date };
export type LineaDistribucion = { avisoId: string; monto: number };

/**
 * Propuesta por defecto: primero lo más antiguo (por vencimiento). Es solo la sugerencia que se
 * muestra en el formulario; la administración puede cambiarla antes de confirmar.
 * Montos en unidades mínimas (pesos enteros para CLP).
 */
export function proponerDistribucion(monto: number, avisos: AvisoConSaldo[]) {
  const ordenados = [...avisos].filter((a) => a.saldo > 0).sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());
  const { aplicaciones, sobrante } = aplicarPago(monto, ordenados);
  return { lineas: aplicaciones as LineaDistribucion[], aFavor: sobrante };
}

export class DistribucionInvalida extends Error {}

/**
 * Revisa una distribución elegida por la administración. Reglas:
 * - cada aviso debe ser de la unidad y tener saldo pendiente;
 * - a ningún aviso se le aplica más que su saldo (no se «sobrepaga» un aviso);
 * - la suma no puede pasar del monto del pago; lo que sobra queda como saldo a favor.
 * Devuelve las líneas limpias (sin ceros ni repetidos) y el saldo a favor que queda.
 */
export function validarDistribucion(monto: number, lineas: LineaDistribucion[], avisos: AvisoConSaldo[]) {
  const saldoDe = new Map(avisos.map((a) => [a.id, a.saldo]));
  const juntas = new Map<string, number>();
  for (const l of lineas) {
    if (!Number.isInteger(l.monto) || l.monto < 0) throw new DistribucionInvalida("Los montos a aplicar deben ser números positivos.");
    if (l.monto === 0) continue;
    if (!saldoDe.has(l.avisoId)) throw new DistribucionInvalida("Uno de los avisos elegidos no es de esta unidad o ya no tiene saldo pendiente.");
    juntas.set(l.avisoId, (juntas.get(l.avisoId) ?? 0) + l.monto);
  }
  let suma = 0;
  for (const [avisoId, m] of juntas) {
    if (m > saldoDe.get(avisoId)!) throw new DistribucionInvalida("A un aviso se le quiere aplicar más que su saldo pendiente.");
    suma += m;
  }
  if (suma > monto) throw new DistribucionInvalida("Lo que se reparte entre los avisos supera el monto del pago.");
  return { lineas: [...juntas].map(([avisoId, m]) => ({ avisoId, monto: m })), aFavor: monto - suma };
}

/** Lee el campo oculto «distribucion» del formulario (ver DistribucionPago). undefined = no vino. */
export function leerDistribucion(valor: FormDataEntryValue | null): { avisoId: string; monto: number }[] | undefined | "invalida" {
  if (typeof valor !== "string" || valor === "") return undefined;
  try {
    const datos = JSON.parse(valor);
    if (!Array.isArray(datos) || datos.length > 200) return "invalida";
    const lineas = datos.map((l) => ({ avisoId: String(l?.avisoId ?? ""), monto: Number(l?.monto) }));
    if (lineas.some((l) => !l.avisoId || !Number.isFinite(l.monto) || l.monto < 0)) return "invalida";
    return lineas;
  } catch {
    return "invalida";
  }
}

// ---------------------------------------------------------------------------
// Sugerencias para un abono de la cartola

export type AbonoCartola = {
  fecha: Date;
  restante: number; // lo que queda sin conciliar del movimiento
  descripcion: string | null;
  referencia: string | null;
  contraparte: string | null;
  rutContraparte: string | null;
};

export type CandidatoTransferencia = { id: string; unidadId: string; unidad: string; fecha: Date; monto: number; operacion: string | null; pagadoPor: string | null };
export type CandidatoPago = { id: string; unidadId: string; unidad: string; fecha: Date; monto: number; referencia: string | null };
export type CandidatoUnidad = { id: string; numero: string; deuda: number; saldosAvisos: number[]; ruts: string[]; nombres: string[] };

export type Sugerencia =
  | { tipo: "TRANSFERENCIA"; id: string; unidadId: string; unidad: string; monto: number; puntos: number; motivos: string[] }
  | { tipo: "PAGO"; id: string; unidadId: string; unidad: string; monto: number; puntos: number; motivos: string[] }
  | { tipo: "UNIDAD"; id: string; unidadId: string; unidad: string; monto: number; puntos: number; motivos: string[] };

export const DIAS_TOLERANCIA_INGRESO = 7;
/** Puntaje desde el cual una sugerencia se considera «fuerte». */
export const PUNTOS_FUERTE = 70;

const diasEntre = (a: Date, b: Date) => Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const sinPuntos = (s: string) => s.replace(/[.\s-]/g, "").toUpperCase();

function puntosFecha(dias: number, motivos: string[]) {
  if (dias === 0) {
    motivos.push("misma fecha");
    return 30;
  }
  if (dias <= 2) {
    motivos.push(`${dias} día${dias === 1 ? "" : "s"} de diferencia`);
    return 20;
  }
  motivos.push(`${dias} días de diferencia`);
  return 5;
}

/** ¿El texto de la cartola nombra a la unidad? Ej.: «GC 101 NOV-26», «depto 101», «casa 12». */
export function nombraUnidad(texto: string, numero: string) {
  const n = normalizar(numero).replace(/\s+/g, "");
  if (!n) return false;
  const t = normalizar(texto);
  const escapado = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^0-9A-Z])(?:GC|DEPTO|DPTO|DEP|CASA|UNIDAD|UN|LOCAL|OF|OFICINA)?\\s*${escapado}(?:$|[^0-9A-Z])`).test(t) && /\d/.test(n);
}

/**
 * Qué podría ser este abono, de más a menos probable:
 * 1. una transferencia informada por un residente, todavía pendiente;
 * 2. un pago que la administración ya registró a mano y que aún no tiene movimiento bancario
 *    (así se vincula, sin crear un segundo ingreso);
 * 3. la deuda de una unidad (por monto exacto, número de unidad en la glosa o RUT del emisor).
 * `ambigua` = no hay exactamente una sugerencia fuerte: se deja en revisión, nadie decide solo.
 */
export function sugerirParaAbono(
  abono: AbonoCartola,
  datos: { transferencias: CandidatoTransferencia[]; pagos: CandidatoPago[]; unidades: CandidatoUnidad[] },
) {
  const lista: Sugerencia[] = [];
  const glosa = `${abono.descripcion ?? ""} ${abono.referencia ?? ""} ${abono.contraparte ?? ""}`;
  const digitos = soloDigitos(glosa);
  const rut = abono.rutContraparte ? sinPuntos(abono.rutContraparte) : "";
  if (abono.restante <= 0) return { sugerencias: lista, ambigua: false };

  for (const t of datos.transferencias) {
    const dias = diasEntre(abono.fecha, t.fecha);
    if (dias > DIAS_TOLERANCIA_INGRESO) continue;
    const motivos = ["transferencia informada por el residente"];
    let puntos = 10;
    if (t.monto === abono.restante) {
      puntos += 40;
      motivos.push("mismo monto");
    } else if (t.monto < abono.restante) {
      motivos.push("el abono es mayor que lo informado");
    } else {
      motivos.push("el abono es menor que lo informado");
    }
    puntos += puntosFecha(dias, motivos);
    const op = t.operacion ? soloDigitos(t.operacion) : "";
    if (op.length >= 4 && digitos.includes(op)) {
      puntos += 40;
      motivos.push("número de operación en la cartola");
    }
    if (nombraUnidad(glosa, t.unidad)) {
      puntos += 15;
      motivos.push(`la glosa nombra la unidad ${t.unidad}`);
    }
    lista.push({ tipo: "TRANSFERENCIA", id: t.id, unidadId: t.unidadId, unidad: t.unidad, monto: t.monto, puntos, motivos });
  }

  for (const p of datos.pagos) {
    const dias = diasEntre(abono.fecha, p.fecha);
    if (dias > DIAS_TOLERANCIA_INGRESO || p.monto > abono.restante) continue;
    const motivos = ["pago ya registrado a mano, sin movimiento bancario"];
    let puntos = 10;
    if (p.monto === abono.restante) {
      puntos += 40;
      motivos.push("mismo monto");
    } else {
      motivos.push("el abono es mayor que el pago");
    }
    puntos += puntosFecha(dias, motivos);
    const ref = p.referencia ? soloDigitos(p.referencia) : "";
    if (ref.length >= 4 && digitos.includes(ref)) {
      puntos += 30;
      motivos.push("misma referencia");
    }
    if (nombraUnidad(glosa, p.unidad)) {
      puntos += 15;
      motivos.push(`la glosa nombra la unidad ${p.unidad}`);
    }
    lista.push({ tipo: "PAGO", id: p.id, unidadId: p.unidadId, unidad: p.unidad, monto: p.monto, puntos, motivos });
  }

  for (const u of datos.unidades) {
    const motivos: string[] = [];
    let puntos = 0;
    if (u.deuda > 0 && u.deuda === abono.restante) {
      puntos += 35;
      motivos.push("igual a la deuda total de la unidad");
    } else if (u.saldosAvisos.includes(abono.restante)) {
      puntos += 25;
      motivos.push("igual al saldo de un aviso de la unidad");
    }
    if (nombraUnidad(glosa, u.numero)) {
      puntos += 35;
      motivos.push(`la glosa nombra la unidad ${u.numero}`);
    }
    if (rut && u.ruts.some((r) => sinPuntos(r) === rut)) {
      puntos += 35;
      motivos.push("el RUT del emisor es de una persona de la unidad");
    } else if (abono.contraparte) {
      const c = normalizar(abono.contraparte);
      if (u.nombres.some((n) => n.length > 5 && c.includes(normalizar(n)))) {
        puntos += 20;
        motivos.push("el nombre del emisor es de una persona de la unidad");
      }
    }
    if (puntos < 25) continue;
    lista.push({ tipo: "UNIDAD", id: u.id, unidadId: u.id, unidad: u.numero, monto: Math.min(abono.restante, u.deuda || abono.restante), puntos, motivos });
  }

  // Unidades que coinciden SOLO por monto: si son muchas (todas deben lo mismo) o ya hay una
  // sugerencia fuerte, no aportan y confunden; se omiten (la unidad igual se puede elegir a mano).
  const soloMonto = (s: Sugerencia) => s.tipo === "UNIDAD" && s.motivos.every((m) => m.startsWith("igual a"));
  const hayFuerte = lista.some((s) => s.puntos >= PUNTOS_FUERTE);
  if (hayFuerte || lista.filter(soloMonto).length > 3) {
    for (let i = lista.length - 1; i >= 0; i--) if (soloMonto(lista[i])) lista.splice(i, 1);
  }
  lista.sort((a, b) => b.puntos - a.puntos || orden(a.tipo) - orden(b.tipo));
  const fuertes = lista.filter((s) => s.puntos >= PUNTOS_FUERTE);
  return { sugerencias: lista.slice(0, 12), ambigua: fuertes.length !== 1 };
}

const orden = (t: Sugerencia["tipo"]) => (t === "TRANSFERENCIA" ? 0 : t === "PAGO" ? 1 : 2);

/** Estado del movimiento según cuánto se ha conciliado. Montos en unidades mínimas. */
export function estadoSegunConciliado(monto: number, conciliado: number): "PENDIENTE" | "REVISAR" | "CONCILIADO" {
  const total = Math.abs(monto);
  if (conciliado <= 0) return "PENDIENTE";
  return conciliado >= total ? "CONCILIADO" : "REVISAR";
}
