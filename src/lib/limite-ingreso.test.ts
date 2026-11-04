import { test } from "node:test";
import assert from "node:assert/strict";
import { fallosRecientes, LIMITE, minutosDeBloqueo } from "./limite-ingreso";

const ahora = new Date("2026-11-04T12:00:00Z");
const hace = (min: number, exitoso = false) => ({ exitoso, creadoEn: new Date(ahora.getTime() - min * 60_000) });

test("cuatro fallos no bloquean, el quinto sí", () => {
  const cuatro = [hace(1), hace(2), hace(3), hace(4)];
  assert.equal(minutosDeBloqueo(cuatro, LIMITE.fallosPorCorreo, ahora), 0);
  assert.ok(minutosDeBloqueo([...cuatro, hace(5)], LIMITE.fallosPorCorreo, ahora) > 0);
});

test("los fallos de hace más de 15 minutos no cuentan", () => {
  const viejos = [hace(16), hace(17), hace(18), hace(19), hace(20)];
  assert.equal(fallosRecientes(viejos, ahora).length, 0);
  assert.equal(minutosDeBloqueo(viejos, LIMITE.fallosPorCorreo, ahora), 0);
});

test("un ingreso correcto reinicia la cuenta", () => {
  const intentos = [hace(1), hace(2), hace(3, true), hace(4), hace(5), hace(6)];
  assert.equal(fallosRecientes(intentos, ahora).length, 2);
});

test("el bloqueo termina 15 minutos después del quinto fallo más reciente", () => {
  const intentos = [hace(1), hace(2), hace(3), hace(4), hace(10)];
  assert.equal(minutosDeBloqueo(intentos, LIMITE.fallosPorCorreo, ahora), 5);
});
