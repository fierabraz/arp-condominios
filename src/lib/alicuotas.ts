import { TOLERANCIA_ALICUOTA } from "./cobro";

export type EstadoAlicuotas = {
  /** ok: cuadra · progreso: faltan unidades por cargar · revisar: falta saber el total · error: hay que corregir */
  tipo: "ok" | "progreso" | "revisar" | "error";
  texto: string;
  /** Cuántas unidades faltan por cargar, si se conoce el total. */
  faltan?: number;
};

const pct = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 6 })} %`;
const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/**
 * Qué decir de la suma de alícuotas según cuántas unidades hay cargadas y cuántas tiene la propiedad.
 * Mientras falten unidades, la suma baja de 100 % es normal: se muestra el avance, no un error.
 */
export function estadoAlicuotas({
  cargadas,
  suma,
  total,
}: {
  cargadas: number;
  suma: number;
  total?: number | null;
}): EstadoAlicuotas {
  const cuadra = Math.abs(suma - 100) < TOLERANCIA_ALICUOTA;
  const pasada = suma > 100 + TOLERANCIA_ALICUOTA;

  if (cuadra) {
    if (total && cargadas < total) {
      return {
        tipo: "error",
        faltan: total - cargadas,
        texto: `Las alícuotas ya suman 100 %, pero hay ${cargadas} de ${total} unidades cargadas. Revisa las alícuotas o corrige el total de unidades en Configurar propiedad.`,
      };
    }
    return { tipo: "ok", texto: `Las alícuotas de las ${unidades(cargadas)} suman 100 %. Cuadra.` };
  }

  if (pasada) {
    return {
      tipo: "error",
      texto: `Las alícuotas de las ${unidades(cargadas)} suman ${pct(suma)}, más de 100 %. Corrígelas antes de emitir el próximo cobro.`,
    };
  }

  if (!total) {
    return {
      tipo: "revisar",
      texto: `Hay ${unidades(cargadas)} cargadas y sus alícuotas suman ${pct(suma)}. Si aún faltan unidades por cargar, es normal. Indica cuántas unidades tiene la propiedad en total para seguir el avance.`,
    };
  }

  if (cargadas < total) {
    const faltan = total - cargadas;
    return {
      tipo: "progreso",
      faltan,
      texto: `Llevas ${cargadas} de ${total} unidades cargadas (faltan ${faltan}). Sus alícuotas suman ${pct(suma)}; al completar todas deberían llegar a 100 %.`,
    };
  }

  return {
    tipo: "error",
    texto:
      cargadas === total
        ? `Ya están las ${total} unidades y sus alícuotas suman ${pct(suma)}. Deben sumar 100 % para cobrar bien: corrígelas antes de emitir el próximo cobro.`
        : `Hay ${cargadas} unidades cargadas, más que las ${total} indicadas para la propiedad, y sus alícuotas suman ${pct(suma)}. Revisa el total de unidades en Configurar propiedad y las alícuotas.`,
  };
}

/** Colores para cada estado (mismos tonos que Mensaje e Insignia). */
export const COLOR_ALICUOTAS: Record<EstadoAlicuotas["tipo"], string> = {
  ok: "bg-exito-suave text-exito",
  progreso: "bg-marca-suave text-marca",
  revisar: "bg-alerta-suave text-alerta",
  error: "bg-peligro-suave text-peligro",
};
