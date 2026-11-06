// Pruebas con base de datos: pagos simultáneos, anulación y aislamiento entre propiedades.
// Necesitan una base de PRUEBA vacía o de demostración (nunca la real): npm run test:bd
// En GitHub corren contra una base temporal que se crea y se borra en cada revisión.
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { anularPago, emitirPeriodo, ErrorCobro, PagoDuplicado, registrarPago } from "../src/lib/cobro-servicio";
import { puedeVerCondominio, puedeVerUnidad } from "../src/lib/acceso";
import type { UsuarioActual } from "../src/lib/auth";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const creadas: string[] = [];

/** Una administradora con una propiedad, sus unidades y un mes cerrado con avisos. */
async function escenario(nombre: string, unidades: number, gastoComun: number) {
  const adm = await db.administradora.create({ data: { nombre: `Prueba ${nombre} ${sufijo}` } });
  creadas.push(adm.id);
  const condominio = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: `Edificio ${nombre}`, direccion: "Calle 1", porcentajeReserva: 0, estado: "HABILITADA_FINANCIERA" },
  });
  const u = [];
  for (let i = 1; i <= unidades; i++) {
    u.push(
      await db.unidad.create({
        data: { administradoraId: adm.id, condominioId: condominio.id, numero: String(100 + i), alicuota: 100 / unidades },
      }),
    );
  }
  const periodo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: condominio.id, anio: 2026, mes: 1 } });
  await db.gasto.create({
    data: {
      administradoraId: adm.id,
      periodoId: periodo.id,
      tipo: "COMUN",
      categoria: "Aseo",
      descripcion: "Aseo",
      monto: gastoComun,
      fecha: new Date("2026-01-15"),
    },
  });
  await emitirPeriodo(periodo.id, adm.id);
  return { adm, condominio, unidades: u, periodo };
}

const pagoDe = (unidadId: string, monto: number) => ({
  unidadId,
  monto,
  fecha: new Date("2026-02-01"),
  medio: "TRANSFERENCIA" as const,
});

async function saldosDe(unidadId: string) {
  const avisos = await db.avisoCobro.findMany({ where: { unidadId }, select: { saldo: true, total: true } });
  const pagos = await db.pago.findMany({ where: { unidadId }, include: { aplicaciones: true } });
  return { avisos, pagos };
}

before(async () => {
  await db.$connect();
});

after(async () => {
  await db.administradora.deleteMany({ where: { id: { in: creadas } } });
  await db.$disconnect();
});

describe("pagos simultáneos (SEG-23)", () => {
  test("10 pagos a la vez de la misma unidad no dejan saldos negativos y todo cuadra", async () => {
    // Una unidad con un aviso de 100.000; diez pagos de 15.000 al mismo tiempo = 150.000.
    const { adm, unidades } = await escenario("simultaneos", 1, 100_000);
    const unidad = unidades[0];
    // Son pagos iguales a propósito: se confirma que son distintos para probar solo el bloqueo.
    await Promise.all(
      Array.from({ length: 10 }, () => registrarPago(adm.id, pagoDe(unidad.id, 15_000), { permitirDuplicado: true })),
    );

    const { avisos, pagos } = await saldosDe(unidad.id);
    assert.equal(avisos.length, 1);
    const aviso = avisos[0];
    assert.equal(Number(aviso.saldo), 0, "el aviso queda pagado, no en negativo");
    const aplicado = pagos.flatMap((p) => p.aplicaciones).reduce((s, a) => s + Number(a.monto), 0);
    assert.equal(aplicado, 100_000, "se aplica exactamente el total del aviso");
    const pagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
    assert.equal(pagado - aplicado, 50_000, "lo que sobra queda como saldo a favor");
    for (const p of pagos) {
      const usado = p.aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
      assert.ok(usado <= Number(p.monto), "ningún pago se aplica por más de su monto");
    }
  });

  test("dos cierres del mismo mes a la vez emiten los avisos una sola vez", async () => {
    const { adm, condominio } = await escenario("cierre", 2, 50_000);
    const periodo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: condominio.id, anio: 2026, mes: 2 } });
    const r = await Promise.allSettled([emitirPeriodo(periodo.id, adm.id), emitirPeriodo(periodo.id, adm.id)]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(await db.avisoCobro.count({ where: { periodoId: periodo.id } }), 2);
  });
});

describe("anular pagos sin borrarlos (SEG-21)", () => {
  test("anular devuelve el monto a la deuda y el pago queda como anulado con su motivo", async () => {
    const { adm, unidades } = await escenario("anular", 1, 80_000);
    const unidad = unidades[0];
    const pago = await registrarPago(adm.id, pagoDe(unidad.id, 30_000));
    assert.equal(Number((await saldosDe(unidad.id)).avisos[0].saldo), 50_000);

    await anularPago(pago.id, adm.id, { por: "Prueba", motivo: "Transferencia rechazada" });
    const { avisos, pagos } = await saldosDe(unidad.id);
    assert.equal(Number(avisos[0].saldo), 80_000, "la deuda vuelve a estar completa");
    assert.equal(pagos.length, 1, "el pago no se borra");
    assert.ok(pagos[0].anuladoEn);
    assert.equal(pagos[0].anuladoPor, "Prueba");
    assert.equal(pagos[0].motivoAnulacion, "Transferencia rechazada");
    assert.equal(pagos[0].aplicaciones.length, 0, "ya no se aplica a ningún aviso");
  });

  test("un pago anulado no cuenta como saldo a favor en los cobros siguientes", async () => {
    const { adm, condominio, unidades } = await escenario("a-favor", 1, 10_000);
    const unidad = unidades[0];
    const pago = await registrarPago(adm.id, pagoDe(unidad.id, 50_000)); // 40.000 a favor
    await anularPago(pago.id, adm.id, { por: "Prueba", motivo: "Pago duplicado" });
    const marzo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: condominio.id, anio: 2026, mes: 3 } });
    await emitirPeriodo(marzo.id, adm.id); // sin gastos: aviso en 0, pero no debe usar el pago anulado
    const pagos = await db.pago.findMany({ where: { unidadId: unidad.id }, include: { aplicaciones: true } });
    assert.equal(pagos[0].aplicaciones.length, 0);
  });

  test("dos anulaciones a la vez devuelven el monto una sola vez", async () => {
    const { adm, unidades } = await escenario("doble-anulacion", 1, 60_000);
    const unidad = unidades[0];
    const pago = await registrarPago(adm.id, pagoDe(unidad.id, 20_000));
    const r = await Promise.allSettled([
      anularPago(pago.id, adm.id, { por: "A", motivo: "Error de digitación" }),
      anularPago(pago.id, adm.id, { por: "B", motivo: "Error de digitación" }),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    const rechazo = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    assert.ok(rechazo.reason instanceof ErrorCobro);
    assert.equal(Number((await saldosDe(unidad.id)).avisos[0].saldo), 60_000);
  });

  test("no se puede anular un pago de otra administradora", async () => {
    const a = await escenario("propia", 1, 10_000);
    const b = await escenario("ajena", 1, 10_000);
    const pago = await registrarPago(a.adm.id, pagoDe(a.unidades[0].id, 5_000));
    await assert.rejects(anularPago(pago.id, b.adm.id, { por: "Intruso", motivo: "Prueba de acceso" }), ErrorCobro);
    assert.equal((await db.pago.findUniqueOrThrow({ where: { id: pago.id } })).anuladoEn, null);
  });
});

describe("pagos duplicados (SEG-22)", () => {
  test("un pago igual (unidad, monto y día) no se guarda sin confirmar; confirmado, sí", async () => {
    const { adm, unidades } = await escenario("duplicados", 1, 100_000);
    const unidad = unidades[0];
    await registrarPago(adm.id, pagoDe(unidad.id, 30_000));
    await assert.rejects(registrarPago(adm.id, { ...pagoDe(unidad.id, 30_000), fecha: new Date("2026-02-01T18:00:00Z") }), PagoDuplicado);
    assert.equal(await db.pago.count({ where: { unidadId: unidad.id } }), 1);
    // Otro monto u otro día no es duplicado.
    await registrarPago(adm.id, pagoDe(unidad.id, 30_001));
    await registrarPago(adm.id, { ...pagoDe(unidad.id, 30_000), fecha: new Date("2026-02-02") });
    // Confirmado como distinto, se guarda.
    await registrarPago(adm.id, pagoDe(unidad.id, 30_000), { permitirDuplicado: true });
    assert.equal(await db.pago.count({ where: { unidadId: unidad.id } }), 4);
  });

  test("dos pagos iguales enviados a la vez: entra uno y el otro pide confirmar", async () => {
    const { adm, unidades } = await escenario("duplicados-a-la-vez", 1, 100_000);
    const r = await Promise.allSettled([1, 2].map(() => registrarPago(adm.id, pagoDe(unidades[0].id, 25_000))));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.ok(r.some((x) => x.status === "rejected" && x.reason instanceof PagoDuplicado));
  });

  test("un pago anulado no cuenta como duplicado", async () => {
    const { adm, unidades } = await escenario("duplicado-anulado", 1, 100_000);
    const p = await registrarPago(adm.id, pagoDe(unidades[0].id, 10_000));
    await anularPago(p.id, adm.id, { por: "Prueba", motivo: "Transferencia rechazada" });
    await registrarPago(adm.id, pagoDe(unidades[0].id, 10_000));
  });
});

describe("registro de cambios en la misma operación (SEG-25)", () => {
  const autorDe = (administradoraId: string) => ({ id: "usuario-prueba", nombre: "Prueba", administradoraId });

  test("el pago y su registro quedan juntos, con el id del pago y cómo quedó", async () => {
    const { adm, condominio, unidades } = await escenario("auditoria", 1, 100_000);
    const pago = await registrarPago(adm.id, pagoDe(unidades[0].id, 40_000), {
      anotar: (p) => ({
        autor: autorDe(adm.id),
        accion: "Registró un pago",
        detalle: "Unidad 101",
        condominioId: condominio.id,
        entidad: "Pago",
        entidadId: p.id,
        despues: { monto: "40000" },
      }),
    });
    const r = await db.registroCambio.findFirstOrThrow({ where: { entidad: "Pago", entidadId: pago.id } });
    assert.deepEqual(r.despues, { monto: "40000" });

    await anularPago(pago.id, adm.id, { por: "Prueba", motivo: "Error de digitación" }, ({ devuelto }) => ({
      autor: autorDe(adm.id),
      accion: "Anuló un pago",
      detalle: "Unidad 101",
      condominioId: condominio.id,
      entidad: "Pago",
      entidadId: pago.id,
      antes: { estado: "Vigente" },
      despues: { estado: "Anulado", devuelto },
    }));
    const anulacion = await db.registroCambio.findFirstOrThrow({ where: { entidadId: pago.id, accion: "Anuló un pago" } });
    assert.deepEqual(anulacion.despues, { estado: "Anulado", devuelto: "40000" });
  });

  test("si el registro falla, el pago no se guarda y la deuda no cambia", async () => {
    const { adm, unidades } = await escenario("auditoria-falla", 1, 100_000);
    const unidad = unidades[0];
    const antes = await saldosDe(unidad.id);
    await assert.rejects(
      registrarPago(adm.id, pagoDe(unidad.id, 40_000), {
        // Falta el nombre de quien lo hizo: la base rechaza el registro.
        anotar: () => ({ autor: { ...autorDe(adm.id), nombre: null as unknown as string }, accion: "Registró un pago", detalle: "x" }),
      }),
      /usuarioNombre/,
    );
    const despues = await saldosDe(unidad.id);
    assert.equal(despues.pagos.length, 0);
    assert.deepEqual(despues.avisos, antes.avisos);
  });

  test("si el registro del cierre falla, el mes sigue abierto y no se emiten avisos", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba cierre-falla ${sufijo}` } });
    creadas.push(adm.id);
    const c = await db.condominio.create({
      data: { administradoraId: adm.id, nombre: "Edificio cierre", direccion: "Calle 1", porcentajeReserva: 0, estado: "HABILITADA_FINANCIERA" },
    });
    await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 100 } });
    const periodo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 3 } });
    await assert.rejects(
      emitirPeriodo(periodo.id, adm.id, () => ({ autor: { ...autorDe(adm.id), nombre: null as unknown as string }, accion: "Cerró", detalle: "x" })),
      /usuarioNombre/,
    );
    assert.equal((await db.periodo.findUniqueOrThrow({ where: { id: periodo.id } })).estado, "ABIERTO");
    assert.equal(await db.avisoCobro.count({ where: { periodoId: periodo.id } }), 0);
  });

  test("el registro se conserva aunque se elimine la administradora", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba borrar ${sufijo}` } });
    const r = await db.registroCambio.create({
      data: { administradoraId: adm.id, usuarioNombre: "Prueba", accion: "Prueba", detalle: "x" },
    });
    await db.administradora.delete({ where: { id: adm.id } });
    assert.ok(await db.registroCambio.findUnique({ where: { id: r.id } }));
    await db.registroCambio.delete({ where: { id: r.id } });
  });
});

describe("aislamiento entre administradoras y propiedades (SEG-15, SEG-16)", () => {
  function usuario(datos: Partial<UsuarioActual>): UsuarioActual {
    return {
      id: "u",
      nombre: "Prueba",
      correo: "prueba@ejemplo.cl",
      rol: "ADMINISTRADOR",
      administradoraId: null,
      condominioId: null,
      personaId: null,
      accesoTodas: false,
      asignados: [],
      administradora: { nombre: "Prueba", moneda: "CLP" },
      ...datos,
    };
  }

  test("cada cuenta ve solo lo que le corresponde, aunque cambie el id en la dirección", async () => {
    const a = await escenario("aislamiento-a", 2, 10_000);
    const otraPropiedad = await db.condominio.create({
      data: { administradoraId: a.adm.id, nombre: "Edificio vecino", direccion: "Calle 2" },
    });
    const unidadVecina = await db.unidad.create({
      data: { administradoraId: a.adm.id, condominioId: otraPropiedad.id, numero: "1", alicuota: 100 },
    });
    const b = await escenario("aislamiento-b", 1, 10_000);

    const principal = usuario({ administradoraId: a.adm.id, accesoTodas: true });
    const asignado = usuario({ administradoraId: a.adm.id, asignados: [a.condominio.id] });
    const comite = usuario({ administradoraId: a.adm.id, rol: "COMITE", condominioId: a.condominio.id });
    const deOtra = usuario({ administradoraId: b.adm.id, accesoTodas: true });

    // Principal: todas las de su administradora.
    assert.equal(await puedeVerCondominio(principal, a.condominio.id), true);
    assert.equal(await puedeVerCondominio(principal, otraPropiedad.id), true);
    // Asignado y comité: solo la suya.
    for (const u of [asignado, comite]) {
      assert.equal(await puedeVerCondominio(u, a.condominio.id), true);
      assert.equal(await puedeVerUnidad(u, a.unidades[0].id), true);
      assert.equal(await puedeVerCondominio(u, otraPropiedad.id), false);
      assert.equal(await puedeVerUnidad(u, unidadVecina.id), false);
    }
    // Otra administradora: nada de la primera, aunque sea su administrador principal.
    assert.equal(await puedeVerCondominio(deOtra, a.condominio.id), false);
    assert.equal(await puedeVerUnidad(deOtra, a.unidades[0].id), false);
    assert.equal(await puedeVerCondominio(deOtra, b.condominio.id), true);
  });
});
