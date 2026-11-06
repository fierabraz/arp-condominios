import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceConfiguracion, pasosConfiguracion, requisitosActivacion, requisitosPara, revisarCambio, type DatosConfiguracion } from "./configuracion";

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

test("paso 08: la lista de requisitos y el permiso para habilitar dicen lo mismo", () => {
  const casos: DatosConfiguracion[] = [
    base,
    { ...base, tipo: null },
    { ...base, unidades: 0, sumaAlicuotas: 0 },
    { ...base, unidadesSinPropietario: 2 },
    { ...base, sumaAlicuotas: 60, unidades: 1 },
    { ...base, modalidad: "EXISTENTE" },
  ];
  for (const d of casos) {
    for (const destino of ["HABILITADA_ADMINISTRATIVA", "HABILITADA_FINANCIERA"] as const) {
      const faltan = requisitosPara(requisitosActivacion(d), destino).filter((r) => !r.cumple && r.tipo !== "advertencia");
      assert.equal(revisarCambio(d, destino).ok, faltan.length === 0, `${destino} con ${JSON.stringify({ ...d, fechaIncorporacion: 0 })}`);
    }
  }
});

test("paso 08: una comunidad existente muestra su apertura y la aprobación como restringida", () => {
  const ap = { estado: "EN_REVISION" as const, fechaCorte: new Date("2026-11-30"), deudas: 3, fondos: 1, cuentas: 1 };
  const d = { ...base, modalidad: "EXISTENTE" as const, apertura: ap };
  const rs = requisitosActivacion(d, { bloqueos: [], advertencias: ["2 deudas por verificar."] });
  assert.deepEqual(
    rs.filter((r) => r.nivel === "HABILITADA_FINANCIERA").map((r) => [r.clave, r.cumple]),
    [
      ["alicuotas", true],
      ["apertura", true],
      ["apertura-revision", true],
      ["apertura-completa", true],
      ["apertura-observaciones", false],
      ["apertura-aprobacion", false],
    ],
  );
  assert.equal(rs.find((r) => r.clave === "apertura-aprobacion")?.tipo, "restringido");
  // Aunque todo lo demás esté listo, cobrar sigue restringido; las observaciones solo advierten.
  const r = revisarCambio(d, "HABILITADA_FINANCIERA", { bloqueos: [], advertencias: ["2 deudas por verificar."] });
  assert.equal(r.ok, false);
  assert.equal(r.bloqueos.length, 1);
  assert.match(r.bloqueos[0], /restringido/);
  assert.deepEqual(r.advertencias, ["2 deudas por verificar."]);
  // Sin fondos ni cuentas, la revisión de la apertura también bloquea.
  const sinFondos = revisarCambio(d, "HABILITADA_FINANCIERA", { bloqueos: ["Registra al menos un fondo (aunque su saldo sea 0)."], advertencias: [] });
  assert.equal(sinFondos.bloqueos.length, 2);
  // Una comunidad nueva no tiene requisitos de apertura.
  assert.equal(requisitosActivacion(base).some((r) => r.clave.startsWith("apertura")), false);
});
