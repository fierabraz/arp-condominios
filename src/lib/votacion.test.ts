import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoEfectivo, resultados } from "./votacion";

const opciones = [
  { id: "si", texto: "A favor" },
  { id: "no", texto: "En contra" },
];
// 8 unidades de 11 % y 4 de 3 %, como el edificio de ejemplo.
const unidades = [...Array(8).fill({ alicuota: 11 }), ...Array(4).fill({ alicuota: 3 })];

test("pondera por alícuota", () => {
  const r = resultados(
    opciones,
    [
      { opcionId: "si", alicuota: 11 },
      { opcionId: "no", alicuota: 3 },
      { opcionId: "no", alicuota: 3 },
      { opcionId: "no", alicuota: 3 },
    ],
    unidades,
    "ALICUOTA",
  );
  // 3 unidades votan en contra, pero pesan 9 % contra 11 %.
  assert.equal(r.ganadora?.id, "si");
  assert.equal(Math.round(r.opciones[0].porcentaje * 100) / 100, 55);
  assert.equal(r.participacion, 20);
  assert.equal(r.unidadesVotaron, 4);
});

test("una unidad, un voto", () => {
  const r = resultados(
    opciones,
    [
      { opcionId: "si", alicuota: 11 },
      { opcionId: "no", alicuota: 3 },
      { opcionId: "no", alicuota: 3 },
    ],
    unidades,
    "UNIDAD",
  );
  assert.equal(r.ganadora?.id, "no");
  assert.equal(r.participacion, 25);
});

test("empate y votación sin votos no tienen ganadora", () => {
  assert.equal(resultados(opciones, [], unidades, "ALICUOTA").ganadora, null);
  const empate = resultados(opciones, [{ opcionId: "si", alicuota: 3 }, { opcionId: "no", alicuota: 3 }], unidades, "ALICUOTA");
  assert.equal(empate.ganadora, null);
});

test("una votación abierta vencida se considera cerrada", () => {
  const ahora = new Date("2026-10-20T12:00:00Z");
  assert.equal(estadoEfectivo({ estado: "ABIERTA", cierraEn: new Date("2026-10-19T12:00:00Z") }, ahora), "CERRADA");
  assert.equal(estadoEfectivo({ estado: "ABIERTA", cierraEn: new Date("2026-10-21T12:00:00Z") }, ahora), "ABIERTA");
  assert.equal(estadoEfectivo({ estado: "BORRADOR", cierraEn: new Date("2026-10-19T12:00:00Z") }, ahora), "BORRADOR");
});

test("la fecha de término cierra a las 23:59 de Chile, con y sin horario de verano", async () => {
  const { finDelDiaChile } = await import("./formato");
  assert.equal(finDelDiaChile("2026-10-20").toISOString(), "2026-10-21T02:59:59.000Z"); // verano, UTC-3
  assert.equal(finDelDiaChile("2026-06-20").toISOString(), "2026-06-21T03:59:59.000Z"); // invierno, UTC-4
});
