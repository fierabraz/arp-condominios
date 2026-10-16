// Cálculo de resultados de una votación. Funciones puras para poder probarlas.

export type Ponderacion = "ALICUOTA" | "UNIDAD";
export type Estado = "BORRADOR" | "ABIERTA" | "CERRADA";

/** Una votación abierta cuya fecha de término ya pasó se considera cerrada. */
export function estadoEfectivo(v: { estado: Estado; cierraEn: Date }, ahora = new Date()): Estado {
  return v.estado === "ABIERTA" && v.cierraEn <= ahora ? "CERRADA" : v.estado;
}

export type ResultadoOpcion = { id: string; texto: string; votos: number; peso: number; porcentaje: number };

/**
 * Resultados por opción. Con ponderación por alícuota, cada voto pesa la alícuota de su
 * unidad; si no, cada unidad pesa 1. El porcentaje es sobre lo votado; la participación,
 * sobre el total de la propiedad.
 */
export function resultados(
  opciones: { id: string; texto: string }[],
  votos: { opcionId: string; alicuota: number }[],
  unidades: { alicuota: number }[],
  ponderacion: Ponderacion,
) {
  const peso = (alicuota: number) => (ponderacion === "ALICUOTA" ? alicuota : 1);
  const totalPropiedad = unidades.reduce((s, u) => s + peso(u.alicuota), 0);
  const totalVotado = votos.reduce((s, v) => s + peso(v.alicuota), 0);
  const filas: ResultadoOpcion[] = opciones.map((o) => {
    const propios = votos.filter((v) => v.opcionId === o.id);
    const p = propios.reduce((s, v) => s + peso(v.alicuota), 0);
    return { id: o.id, texto: o.texto, votos: propios.length, peso: p, porcentaje: totalVotado > 0 ? (p / totalVotado) * 100 : 0 };
  });
  const maximo = Math.max(0, ...filas.map((f) => f.peso));
  const ganadoras = maximo > 0 ? filas.filter((f) => Math.abs(f.peso - maximo) < 1e-9) : [];
  return {
    opciones: filas,
    unidadesVotaron: votos.length,
    unidadesTotal: unidades.length,
    participacion: totalPropiedad > 0 ? (totalVotado / totalPropiedad) * 100 : 0,
    // Con empate no hay una opción ganadora.
    ganadora: ganadoras.length === 1 ? ganadoras[0] : null,
  };
}
