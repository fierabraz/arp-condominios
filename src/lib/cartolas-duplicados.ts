// FIN-003.1 · Detección de movimientos ya registrados y posibles duplicados (puro, sin base de datos).
//
// 1) Huella: cada movimiento recibe una huella que sale de sus datos (fecha, monto y referencia; o,
//    sin referencia, descripción y saldo). Dos movimientos idénticos dentro de la misma cartola se
//    distinguen por su orden (1.º, 2.º...), así dos transferencias iguales el mismo día no se pierden
//    y volver a subir el mismo archivo produce exactamente las mismas huellas.
// 2) Lo ya registrado se reconoce por la huella o, entre cartolas de formatos distintos, por la misma
//    referencia bancaria o el mismo saldo después del movimiento.
// 3) Misma fecha y mismo monto NO basta: si no hay referencia ni saldo que lo confirme y la descripción
//    se parece, queda como «posible duplicado» para que lo decida el administrador.

import { createHash } from "node:crypto";
import type { FilaRevision, MovimientoLeido } from "./cartolas";
import { normalizarTitulo } from "./importacion";

const normalizarReferencia = (r: string) => r.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^0+(?=.)/, "");

/** Lo que identifica a un movimiento antes de contar repeticiones. */
export function claveMovimiento(m: Pick<MovimientoLeido, "fecha" | "monto" | "referencia" | "descripcion" | "saldo">) {
  const base = `${m.fecha}|${m.monto.toFixed(2)}`;
  if (m.referencia && normalizarReferencia(m.referencia)) return `${base}|r:${normalizarReferencia(m.referencia)}`;
  return `${base}|d:${normalizarTitulo(m.descripcion ?? "")}|s:${m.saldo === undefined ? "" : m.saldo.toFixed(2)}`;
}

/** Huellas de los movimientos de una cartola, en su orden. */
export function conHuellas<M extends MovimientoLeido>(movs: M[]): (M & { huella: string; repeticion: number })[] {
  const vistos = new Map<string, number>();
  return movs.map((m) => {
    const clave = claveMovimiento(m);
    const repeticion = vistos.get(clave) ?? 0;
    vistos.set(clave, repeticion + 1);
    return { ...m, huella: createHash("sha256").update(`${clave}#${repeticion}`).digest("hex"), repeticion };
  });
}

/** Un movimiento ya guardado en la cuenta. */
export type MovimientoGuardado = {
  id: string;
  huella: string;
  fecha: string;
  monto: number;
  referencia: string | null;
  descripcion: string | null;
  saldo: number | null;
  /** Fecha de la importación que lo trajo, para mostrarla. */
  importado: string;
};

const palabras = (s: string) =>
  new Set(
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 2),
  );

/** Qué tanto se parecen dos descripciones (0 a 1). Una vacía no descarta nada (1). */
export function parecido(a: string | null | undefined, b: string | null | undefined) {
  const [x, y] = [normalizarTitulo(a ?? ""), normalizarTitulo(b ?? "")];
  if (!x || !y) return 1;
  if (x === y || x.includes(y) || y.includes(x)) return 1;
  const [pa, pb] = [palabras(a!), palabras(b!)];
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  return comunes / Math.max(1, Math.min(pa.size, pb.size));
}

const PARECIDO_MINIMO = 0.5;

/**
 * Clasifica cada movimiento de la cartola contra lo que ya tiene la cuenta: nuevo, ya registrado
 * o posible duplicado. Cada movimiento guardado se usa una sola vez.
 */
export function clasificar(movs: (MovimientoLeido & { huella: string; repeticion: number })[], guardados: MovimientoGuardado[]): FilaRevision[] {
  const porHuella = new Map(guardados.map((g) => [g.huella, g]));
  const usados = new Set<string>();
  const resultado: (FilaRevision | undefined)[] = movs.map((m) => {
    const g = porHuella.get(m.huella);
    if (!g) return undefined;
    usados.add(g.id);
    return { ...sinRepeticion(m), estado: "REGISTRADO", motivo: `Ya se importó el ${fechaCorta(g.importado)}.` };
  });

  const resumen = (g: MovimientoGuardado) => ({ fecha: g.fecha, descripcion: g.descripcion, referencia: g.referencia, monto: g.monto, importado: g.importado });
  const repetidosEnArchivo = new Map<string, number>();
  for (const m of movs) repetidosEnArchivo.set(claveMovimiento(m), (repetidosEnArchivo.get(claveMovimiento(m)) ?? 0) + 1);

  movs.forEach((m, i) => {
    if (resultado[i]) return;
    const fila = sinRepeticion(m);
    const candidatos = guardados.filter((g) => !usados.has(g.id) && g.fecha === m.fecha && Math.abs(g.monto - m.monto) < 0.005);
    let fuerte: MovimientoGuardado | undefined;
    let dudoso: MovimientoGuardado | undefined;
    let distinto: MovimientoGuardado | undefined;
    for (const g of candidatos) {
      const refA = m.referencia ? normalizarReferencia(m.referencia) : "";
      const refB = g.referencia ? normalizarReferencia(g.referencia) : "";
      if (refA && refB) {
        if (refA === refB) {
          fuerte ??= g;
          continue;
        }
        distinto ??= g; // referencias distintas: son operaciones distintas
        continue;
      }
      if (m.saldo !== undefined && g.saldo !== null) {
        if (Math.abs(m.saldo - g.saldo) < 0.005) fuerte ??= g;
        else distinto ??= g; // el saldo después del movimiento es otro: es otra operación
        continue;
      }
      if (parecido(m.descripcion, g.descripcion) >= PARECIDO_MINIMO) dudoso ??= g;
      else distinto ??= g;
    }
    if (fuerte) {
      usados.add(fuerte.id);
      const porRef = !!(m.referencia && fuerte.referencia);
      resultado[i] = {
        ...fila,
        estado: "REGISTRADO",
        motivo: `Ya se importó el ${fechaCorta(fuerte.importado)} (${porRef ? "misma referencia bancaria" : "mismo saldo después del movimiento"}).`,
        parecido: resumen(fuerte),
      };
    } else if (dudoso) {
      usados.add(dudoso.id);
      resultado[i] = {
        ...fila,
        estado: "POSIBLE_DUPLICADO",
        motivo: "Hay un movimiento guardado con la misma fecha y monto y una descripción parecida, sin referencia ni saldo que lo confirme. Decide si es el mismo.",
        parecido: resumen(dudoso),
      };
    } else {
      const repetido = (repetidosEnArchivo.get(claveMovimiento(m)) ?? 0) > 1;
      resultado[i] = {
        ...fila,
        estado: "NUEVO",
        motivo: repetido
          ? "La cartola trae otro movimiento idéntico (misma fecha, monto y descripción): se tratan como operaciones distintas."
          : distinto
            ? "Hay otro movimiento con la misma fecha y monto, pero con otra referencia, saldo o descripción: se considera distinto."
            : undefined,
      };
    }
  });
  return resultado as FilaRevision[];
}

function sinRepeticion<M extends { repeticion: number }>(m: M): Omit<M, "repeticion"> {
  const copia: Partial<M> = { ...m };
  delete copia.repeticion;
  return copia as Omit<M, "repeticion">;
}

const fechaCorta = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");
