import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceConfiguracion, pasosConfiguracion, revisarCambio, type DatosConfiguracion } from "./configuracion";

const base: DatosConfiguracion = {
  estado: "EN_CONFIGURACION",
  nombre: "Condominio Ejemplo",
  direccion: "Av. Siempre Viva 123",
  tipo: "EDIFICIO",
  modalidad: "NUEVA",
  fechaIncorporacion: new Date("2026-12-01"),
  totalUnidades: 2,
  unidades: 2,
  sumaAlicuotas: 100,
  unidadesSinPropietario: 0,
  cobrosEmitidos: 0,
};

test("una comunidad recién creada, solo con nombre y dirección, queda con la identificación pendiente", () => {
  const d = { ...base, tipo: null, modalidad: null, fechaIncorporacion: null, unidades: 0, sumaAlicuotas: 0, totalUnidades: null };
  const pasos = pasosConfiguracion(d);
  assert.equal(pasos.length, 8);
  assert.equal(pasos[0].estado, "pendiente");
  assert.match(pasos[0].detalle, /tipo de comunidad/);
  assert.equal(pasos[1].estado, "pendiente");
  assert.equal(avanceConfiguracion(d).porcentaje, 0);
  const r = revisarCambio(d, "HABILITADA_ADMINISTRATIVA");
  assert.equal(r.ok, false);
  assert.equal(r.bloqueos.length, 2);
});

test("completa y con alícuotas al 100 % se puede habilitar en ambos niveles", () => {
  assert.equal(avanceConfiguracion(base).porcentaje, 100);
  assert.equal(revisarCambio(base, "HABILITADA_ADMINISTRATIVA").ok, true);
  assert.equal(revisarCambio(base, "HABILITADA_FINANCIERA").ok, true);
});

test("sin propietarios es solo advertencia para la habilitación administrativa", () => {
  const r = revisarCambio({ ...base, unidadesSinPropietario: 1 }, "HABILITADA_ADMINISTRATIVA");
  assert.equal(r.ok, true);
  assert.equal(r.advertencias.length, 1);
});

test("alícuotas incompletas impiden la habilitación financiera pero no la administrativa", () => {
  const d = { ...base, sumaAlicuotas: 60, unidades: 1 };
  assert.equal(revisarCambio(d, "HABILITADA_ADMINISTRATIVA").ok, true);
  const r = revisarCambio(d, "HABILITADA_FINANCIERA");
  assert.equal(r.ok, false);
  assert.match(r.bloqueos[0], /1 de 2 unidades/);
});

test("una comunidad existente no se habilita financieramente sin apertura", () => {
  const d = { ...base, modalidad: "EXISTENTE" as const };
  assert.equal(revisarCambio(d, "HABILITADA_ADMINISTRATIVA").ok, true);
  const r = revisarCambio(d, "HABILITADA_FINANCIERA");
  assert.equal(r.ok, false);
  assert.match(r.bloqueos.join(" "), /apertura/);
  assert.equal(pasosConfiguracion(d)[3].estado, "pendiente");
  assert.equal(pasosConfiguracion(d)[3].ruta, "/apertura");
  // Con la apertura en revisión, el paso 04 queda completo pero cobrar sigue restringido.
  const conApertura = { ...d, apertura: { estado: "EN_REVISION" as const, fechaCorte: new Date("2026-11-30"), deudas: 3, fondos: 2, cuentas: 1 } };
  assert.equal(pasosConfiguracion(conApertura)[3].estado, "completo");
  const r2 = revisarCambio(conApertura, "HABILITADA_FINANCIERA");
  assert.equal(r2.ok, false);
  assert.match(r2.bloqueos.join(" "), /restringido/);
});

test("bajar de estado se permite, salvo dejar de cobrar si ya emitió cobros", () => {
  const fin = { ...base, estado: "HABILITADA_FINANCIERA" as const };
  assert.equal(revisarCambio(fin, "HABILITADA_ADMINISTRATIVA").ok, true);
  assert.equal(revisarCambio({ ...fin, cobrosEmitidos: 3 }, "HABILITADA_ADMINISTRATIVA").ok, false);
  assert.equal(revisarCambio({ ...base, estado: "HABILITADA_ADMINISTRATIVA" }, "EN_CONFIGURACION").ok, true);
  assert.equal(revisarCambio(base, "EN_CONFIGURACION").ok, false);
});

test("el paso 02 resume la estructura física y lleva a ella, sin exigirla", () => {
  const sin = pasosConfiguracion(base)[1];
  assert.equal(sin.estado, "completo");
  assert.equal(sin.otra?.ruta, "/estructura");
  const con = pasosConfiguracion({ ...base, estructura: { agrupaciones: 3, espacios: 1, instalaciones: 0 } })[1];
  assert.equal(con.estado, "completo");
  assert.match(con.detalle, /3 torres, sectores o pisos, 1 estacionamiento o bodega\.$/);
});
