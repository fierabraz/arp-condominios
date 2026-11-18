// FIN-COMP · Entrega A · Conciliación de ingresos contra la base (datos ficticios).
// Recorre el caso de la prueba integral: informar $50.000, seguir PENDIENTE, cartola sin el
// movimiento, cartola con el movimiento, confirmar una sola vez; y los casos difíciles: pago parcial,
// pago mayor, pago manual previo, movimiento ambiguo, reverso, falla técnica y confirmaciones a la vez.
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { borrarConstancias } from "./limpieza";
import { emitirPeriodo, ErrorCobro, estadoCuenta, PagoDuplicado, registrarPago } from "../src/lib/cobro-servicio";
import { confirmarTransferencia, informarTransferencia } from "../src/lib/transferencias-servicio";
import {
  deshacerConciliacion,
  registrarIngresoDesdeMovimiento,
  registrarOtroIngreso,
  reversarTransferencia,
  sugerenciasDeMovimiento,
  vincularPagoConMovimiento,
  vincularTransferenciaConPago,
} from "../src/lib/conciliacion-servicio";
import type { UsuarioActual } from "../src/lib/auth";
import { cambiarEstadoTransferencia } from "../src/lib/transferencias-servicio";
import { consultaPublicaConstancia } from "../src/lib/constancias-servicio";
import { pdfConstancia } from "../src/lib/documento-constancia";
import type { DatosConstancia } from "../src/lib/constancias";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await borrarConstancias(id);
    await db.conciliacionMovimiento.deleteMany({ where: { administradoraId: id } });
    await db.transferenciaInformada.deleteMany({ where: { administradoraId: id } });
    await db.movimientoBancario.deleteMany({ where: { administradoraId: id } });
    await db.importacionCartola.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function escenario() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba conciliación ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 0 },
  });
  const u1 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 50 } });
  const u2 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "102", alicuota: 50 } });
  const residente = async (unidadId: string, n: string) => {
    const persona = await db.persona.create({ data: { administradoraId: adm.id, nombre: `Residente Ficticia ${n}`, documento: n === "1" ? "11.111.111-1" : null } });
    await db.unidadPersona.create({ data: { unidadId, personaId: persona.id, relacion: "RESIDENTE" } });
    const fila = await db.usuario.create({
      data: { administradoraId: adm.id, nombre: persona.nombre, correo: `r${n}-${adm.id}@prueba.cl`, claveHash: "x", rol: "RESIDENTE", personaId: persona.id },
    });
    return {
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      rol: "RESIDENTE",
      administradoraId: adm.id,
      condominioId: null,
      personaId: persona.id,
      accesoTodas: false,
      asignados: [],
      administradora: { nombre: adm.nombre, moneda: "CLP" },
    } as UsuarioActual;
  };
  const r1 = await residente(u1.id, "1");
  const r2 = await residente(u2.id, "2");
  const admin = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  // Octubre: 200.000 de gasto común → 100.000 por unidad.
  const oct = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 10 } });
  await db.gasto.create({ data: { administradoraId: adm.id, periodoId: oct.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 200000, fecha: dia("2026-10-15") } });
  await emitirPeriodo(oct.id, adm.id);
  const cuenta = await db.cuentaBancaria.create({
    data: { administradoraId: adm.id, condominioId: c.id, banco: "Banco Ficticio", tipo: "CORRIENTE", numeroFinal: "4321", creadoPor: "Prueba" },
  });
  let n = 0;
  const importacion = () =>
    db.importacionCartola.create({
      data: {
        administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, banco: cuenta.banco, archivoNombre: `cartola-${n}.csv`, archivoHuella: `h${n}`,
        archivoTamano: 1, formato: "CSV", encontrados: 1, nuevos: 1, yaRegistrados: 0, posiblesDuplicados: 0, duplicadosOmitidos: 0, errores: 0, estado: "APLICADA", usuarioNombre: "Prueba",
      },
    });
  const movimiento = async (fecha: string, monto: number, extra: { descripcion?: string; rutContraparte?: string; huella?: string } = {}) =>
    db.movimientoBancario.create({
      data: {
        administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, importacionId: (await importacion()).id, fecha: dia(fecha), monto,
        huella: extra.huella ?? `m${n++}`, descripcion: extra.descripcion ?? null, rutContraparte: extra.rutContraparte ?? null,
      },
    });
  const informar = (quien: UsuarioActual, unidadId: string, monto: number, fecha = "2026-11-05", operacion?: string) =>
    informarTransferencia(quien, { unidadId, fecha: dia(fecha), monto, operacion }, null, false);
  const pagos = (unidadId: string) => db.pago.findMany({ where: { unidadId } });
  return { adm, c, u1, u2, r1, r2, admin, oct, cuenta, movimiento, informar, pagos };
}

describe("FIN-COMP A · pagos pendientes y conciliación de ingresos", () => {
  test("recorrido: $50.000 informados quedan PENDIENTES hasta la cartola y se registran una sola vez", async () => {
    const e = await escenario();
    const t = await e.informar(e.r1, e.u1.id, 50000);
    // 10. Aparece pendiente y la deuda NO disminuye.
    let estado = (await estadoCuenta(e.u1.id, e.adm.id))!;
    assert.equal(t.estado, "INFORMADA");
    assert.equal(estado.deuda, 100000);
    assert.equal(estado.pagado, 0);
    assert.equal(estado.enVerificacion.cantidad, 1);
    assert.equal(estado.enVerificacion.monto, 50000);
    // 11. Se guarda en la base: otra consulta (otra sesión) la sigue viendo igual.
    assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).estado, "INFORMADA");
    // 12. Cartola SIN ese movimiento: sigue pendiente, nada se confirma solo.
    const otro = await e.movimiento("2026-11-05", 12345);
    const s1 = await sugerenciasDeMovimiento(otro);
    assert.equal(s1.sugerencias.filter((s) => s.tipo === "TRANSFERENCIA" && s.fuerte).length, 0);
    assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).estado, "INFORMADA");
    assert.equal((await e.pagos(e.u1.id)).length, 0);
    // 13. Cartola CON el ingreso: se sugiere la transferencia, sin confirmarla.
    const mov = await e.movimiento("2026-11-05", 50000, { descripcion: "TRANSF GC 101" });
    const s2 = await sugerenciasDeMovimiento(mov);
    assert.equal(s2.sugerencias[0].tipo, "TRANSFERENCIA");
    assert.equal(s2.sugerencias[0].id, t.id);
    assert.equal(s2.ambigua, false);
    assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).estado, "INFORMADA");
    // 14-15. Confirmar: UN pago, deuda -50.000, el pendiente desaparece de «en verificación».
    await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 50000 });
    estado = (await estadoCuenta(e.u1.id, e.adm.id))!;
    assert.equal(estado.deuda, 50000);
    assert.equal(estado.pagado, 50000);
    assert.equal(estado.enVerificacion.cantidad, 0);
    assert.equal((await e.pagos(e.u1.id)).length, 1);
    const m = await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } });
    assert.equal(Number(m.montoConciliado), 50000);
    assert.equal(m.estado, "CONCILIADO");
    // Confirmar otra vez no crea otro pago.
    await assert.rejects(confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 50000 }));
    assert.equal((await e.pagos(e.u1.id)).length, 1);
    // 16. Repetir la importación: el mismo movimiento (misma huella) no puede guardarse dos veces.
    await assert.rejects(e.movimiento("2026-11-05", 50000, { huella: m.huella }));
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: e.cuenta.id, monto: 50000 } }), 1);
  });

  test("pago parcial y pago mayor que la deuda", async () => {
    const e = await escenario();
    const parcial = await e.informar(e.r1, e.u1.id, 30000);
    const m1 = await e.movimiento("2026-11-05", 30000);
    await confirmarTransferencia(e.admin, { transferenciaId: parcial.id, movimientoId: m1.id, monto: 30000 });
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 70000);

    const mayor = await e.informar(e.r2, e.u2.id, 150000);
    const m2 = await e.movimiento("2026-11-06", 150000);
    await confirmarTransferencia(e.admin, { transferenciaId: mayor.id, movimientoId: m2.id, monto: 150000 });
    const est = (await estadoCuenta(e.u2.id, e.adm.id))!;
    assert.equal(est.deuda, 0);
    assert.equal(est.aFavor, 50000);
  });

  test("pago registrado a mano antes: se vincula con la cartola y la transferencia, sin segundo ingreso", async () => {
    const e = await escenario();
    await registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 50000, fecha: dia("2026-11-05"), medio: "TRANSFERENCIA", referencia: "manual" });
    const t = await e.informar(e.r1, e.u1.id, 50000);
    const mov = await e.movimiento("2026-11-05", 50000);
    // Crear otro pago desde la cartola choca con el pago manual (SEG-22): no se duplica por descuido.
    await assert.rejects(registrarIngresoDesdeMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov.id, unidadId: e.u1.id, monto: 50000, transferenciaId: t.id }), PagoDuplicado);
    const s = await sugerenciasDeMovimiento(mov);
    const sugerido = s.sugerencias.find((x) => x.tipo === "PAGO");
    assert.ok(sugerido, "sugiere el pago ya registrado");
    await vincularPagoConMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov.id, pagoId: sugerido!.id });
    const r = await vincularTransferenciaConPago(e.admin, { condominioId: e.c.id, transferenciaId: t.id, pagoId: sugerido!.id });
    assert.equal(r.estado, "CONCILIADA");
    assert.equal((await e.pagos(e.u1.id)).length, 1);
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 50000);
    assert.equal(Number((await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } })).montoConciliado), 50000);
    // El mismo pago no puede quedar respaldado por un segundo movimiento.
    const mov2 = await e.movimiento("2026-11-05", 50000);
    await assert.rejects(vincularPagoConMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov2.id, pagoId: sugerido!.id }));
  });

  test("movimiento ambiguo: dos transferencias iguales quedan en revisión y nada se decide solo", async () => {
    const e = await escenario();
    const a = await e.informar(e.r1, e.u1.id, 50000);
    const b = await e.informar(e.r2, e.u2.id, 50000);
    const mov = await e.movimiento("2026-11-05", 50000);
    const s = await sugerenciasDeMovimiento(mov);
    assert.equal(s.ambigua, true);
    assert.deepEqual(new Set(s.sugerencias.filter((x) => x.tipo === "TRANSFERENCIA").map((x) => x.id)), new Set([a.id, b.id]));
    for (const id of [a.id, b.id]) assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id } })).estado, "INFORMADA");
  });

  test("dos confirmaciones a la vez con el mismo movimiento: solo una usa la plata", async () => {
    const e = await escenario();
    const a = await e.informar(e.r1, e.u1.id, 50000);
    const b = await e.informar(e.r2, e.u2.id, 50000);
    const mov = await e.movimiento("2026-11-05", 50000);
    const r = await Promise.allSettled([
      confirmarTransferencia(e.admin, { transferenciaId: a.id, movimientoId: mov.id, monto: 50000 }),
      confirmarTransferencia(e.admin, { transferenciaId: b.id, movimientoId: mov.id, monto: 50000 }),
    ]);
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(await db.pago.count({ where: { administradoraId: e.adm.id } }), 1);
    assert.equal(Number((await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } })).montoConciliado), 50000);
    const estados = (await db.transferenciaInformada.findMany({ where: { id: { in: [a.id, b.id] } } })).map((t) => t.estado).sort();
    assert.deepEqual(estados, ["CONCILIADA", "INFORMADA"]);
  });

  test("falla técnica durante la comprobación: no queda nada a medias y el pago sigue PENDIENTE", async () => {
    const e = await escenario();
    const t = await e.informar(e.r1, e.u1.id, 50000);
    const mov = await e.movimiento("2026-11-05", 50000);
    // Simula una caída a mitad de la operación: la base rechaza guardar la conciliación,
    // DESPUÉS de que el pago ya se creó dentro de la transacción.
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION falla_simulada() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falla simulada'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(`CREATE TRIGGER falla_simulada BEFORE INSERT ON "ConciliacionMovimiento" FOR EACH ROW EXECUTE FUNCTION falla_simulada()`);
    try {
      await assert.rejects(confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 50000 }));
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER falla_simulada ON "ConciliacionMovimiento"`);
    }
    assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).estado, "INFORMADA");
    assert.equal((await e.pagos(e.u1.id)).length, 0);
    assert.equal(Number((await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } })).montoConciliado), 0);
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 100000);
    // Al volver la conexión, se puede confirmar normalmente sin que el residente informe otra vez.
    await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 50000 });
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 50000);
  });

  test("reverso autorizado: el pago queda anulado, la deuda vuelve y la transferencia queda «Anulado o reversado»", async () => {
    const e = await escenario();
    const t = await e.informar(e.r1, e.u1.id, 50000);
    const mov = await e.movimiento("2026-11-05", 50000);
    const { pagoId } = await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 50000 });
    await reversarTransferencia(e.admin, { condominioId: e.c.id, transferenciaId: t.id, motivo: "El banco devolvió la transferencia" });
    const pago = await db.pago.findUniqueOrThrow({ where: { id: pagoId } });
    assert.ok(pago.anuladoEn, "el pago no se borra: queda anulado");
    assert.equal((await db.transferenciaInformada.findUniqueOrThrow({ where: { id: t.id } })).estado, "ANULADA");
    const m = await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } });
    assert.equal(Number(m.montoConciliado), 0);
    assert.equal(m.estado, "PENDIENTE");
    const conc = await db.conciliacionMovimiento.findFirstOrThrow({ where: { pagoId } });
    assert.ok(conc.anuladaEn, "la conciliación queda anulada, no borrada");
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.deuda, 100000);
    assert.ok(await db.registroCambio.findFirst({ where: { entidad: "Pago", entidadId: pagoId, accion: "Reversó un pago" } }));
  });

  test("la administración elige qué avisos se pagan; lo que sobra queda a favor", async () => {
    const e = await escenario();
    const nov = await db.periodo.create({ data: { administradoraId: e.adm.id, condominioId: e.c.id, anio: 2026, mes: 11 } });
    await db.gasto.create({ data: { administradoraId: e.adm.id, periodoId: nov.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 200000, fecha: dia("2026-11-15") } });
    await emitirPeriodo(nov.id, e.adm.id);
    const avisoNov = await db.avisoCobro.findFirstOrThrow({ where: { unidadId: e.u1.id, periodoId: nov.id } });
    const avisoOct = await db.avisoCobro.findFirstOrThrow({ where: { unidadId: e.u1.id, periodoId: e.oct.id } });
    const mov = await e.movimiento("2026-11-20", 120000);
    // Pide más que el saldo de un aviso: se rechaza y no se guarda nada.
    await assert.rejects(
      registrarIngresoDesdeMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov.id, unidadId: e.u1.id, monto: 120000, distribucion: [{ avisoId: avisoNov.id, monto: 120000 }] }),
      ErrorCobro,
    );
    assert.equal((await e.pagos(e.u1.id)).length, 0);
    // Paga noviembre completo y deja 20.000 a favor; octubre no se toca.
    await registrarIngresoDesdeMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov.id, unidadId: e.u1.id, monto: 120000, distribucion: [{ avisoId: avisoNov.id, monto: 100000 }] });
    assert.equal(Number((await db.avisoCobro.findUniqueOrThrow({ where: { id: avisoNov.id } })).saldo), 0);
    assert.equal(Number((await db.avisoCobro.findUniqueOrThrow({ where: { id: avisoOct.id } })).saldo), 100000);
    assert.equal((await estadoCuenta(e.u1.id, e.adm.id))!.aFavor, 20000);
  });

  test("otro ingreso y deshacer una conciliación (auditado, sin anular el pago)", async () => {
    const e = await escenario();
    const mov = await e.movimiento("2026-11-05", 70000, { rutContraparte: "11111111-1" });
    // El RUT del emisor es de la persona de la unidad 101: se sugiere esa unidad.
    const s = await sugerenciasDeMovimiento(mov);
    assert.equal(s.sugerencias[0]?.unidadId, e.u1.id);
    const otro = await registrarOtroIngreso(e.admin, { condominioId: e.c.id, movimientoId: mov.id, monto: 20000, concepto: "Arriendo de estacionamiento de visitas" });
    const { pagoId, conciliacionId } = await registrarIngresoDesdeMovimiento(e.admin, { condominioId: e.c.id, movimientoId: mov.id, unidadId: e.u1.id, monto: 50000 });
    let m = await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } });
    assert.equal(m.estado, "CONCILIADO");
    // No se puede asignar más de lo que tiene el movimiento.
    await assert.rejects(registrarOtroIngreso(e.admin, { condominioId: e.c.id, movimientoId: mov.id, monto: 1, concepto: "Exceso" }));
    await deshacerConciliacion(e.admin, { condominioId: e.c.id, conciliacionId, motivo: "Era de otra cuenta" });
    m = await db.movimientoBancario.findUniqueOrThrow({ where: { id: mov.id } });
    assert.equal(Number(m.montoConciliado), 20000);
    assert.equal(m.estado, "REVISAR");
    assert.equal((await db.pago.findUniqueOrThrow({ where: { id: pagoId } })).anuladoEn, null, "el pago sigue registrado");
    assert.ok((await db.conciliacionMovimiento.findUniqueOrThrow({ where: { id: otro.id } })).anuladaEn === null);
  });

  test("la base impide dos conciliaciones vigentes del mismo pago", async () => {
    const e = await escenario();
    const pago = await registrarPago(e.adm.id, { unidadId: e.u1.id, monto: 10000, fecha: dia("2026-11-05"), medio: "TRANSFERENCIA" });
    const m1 = await e.movimiento("2026-11-05", 10000);
    const m2 = await e.movimiento("2026-11-05", 10000);
    const fila = (movimientoId: string) => ({ administradoraId: e.adm.id, condominioId: e.c.id, movimientoId, tipo: "PAGO" as const, monto: 10000, pagoId: pago.id, creadoPor: "x" });
    await db.conciliacionMovimiento.create({ data: fila(m1.id) });
    await assert.rejects(db.conciliacionMovimiento.create({ data: fila(m2.id) }));
  });

  test("constancia: folio fijo, versión 1 pendiente, versión 2 verificada y las anteriores no se modifican", async () => {
    const e = await escenario();
    const t = await e.informar(e.r1, e.u1.id, 50000, "2026-11-05", "OP-777");
    const versiones = () =>
      db.constanciaVersion.findMany({ where: { constancia: { transferenciaId: t.id } }, orderBy: { version: "asc" } });
    const c = await db.constanciaPago.findUniqueOrThrow({ where: { transferenciaId: t.id } });
    let v = await versiones();
    assert.equal(v.length, 1, "la constancia nace al informar");
    assert.equal(v[0].estado, "INFORMADA");
    const d1 = v[0].datos as unknown as DatosConstancia;
    assert.equal(d1.montoInformado, 50000);
    assert.equal(d1.montoConfirmado, null);
    assert.equal(d1.referencia, "OP-777");

    // Se confirma por un monto distinto (diferencia): versión 2 con ambos montos y las obligaciones.
    const mov = await e.movimiento("2026-11-05", 45000);
    await confirmarTransferencia(e.admin, { transferenciaId: t.id, movimientoId: mov.id, monto: 45000 });
    v = await versiones();
    assert.equal(v.length, 2);
    assert.equal(v[1].estado, "CONCILIADA");
    const d2 = v[1].datos as unknown as DatosConstancia;
    assert.equal(d2.folio, c.folio, "mismo folio");
    assert.equal(d2.montoInformado, 50000);
    assert.equal(d2.montoConfirmado, 45000);
    assert.deepEqual(d2.aplicaciones, [{ detalle: "Gastos comunes de Octubre 2026", monto: 45000 }]);
    assert.ok(d2.verificadaEn);
    assert.equal(d2.historial.length, 1);
    assert.deepEqual(v[0].datos, d1, "la versión 1 no cambió");

    // La base no permite modificar ni borrar versiones ni el folio.
    await assert.rejects(db.constanciaVersion.update({ where: { id: v[0].id }, data: { estado: "CONCILIADA" } }));
    await assert.rejects(db.constanciaVersion.delete({ where: { id: v[0].id } }));
    await assert.rejects(db.constanciaPago.update({ where: { id: c.id }, data: { codigo: "otro-codigo-cualquiera-123" } }));

    // Reverso: versión 3 «Anulado o reversado», sin borrar las anteriores.
    await reversarTransferencia(e.admin, { condominioId: e.c.id, transferenciaId: t.id, motivo: "El banco devolvió la transferencia" });
    v = await versiones();
    assert.deepEqual(v.map((x) => x.estado), ["INFORMADA", "CONCILIADA", "ANULADA"]);
    assert.match((v[2].datos as unknown as DatosConstancia).nota ?? "", /devolvió/);

    // La consulta pública (QR) muestra el estado vigente y ningún dato personal.
    const pub = await consultaPublicaConstancia(c.codigo);
    assert.equal(pub?.estado, "ANULADA");
    assert.equal(pub?.versiones.length, 3);
    const texto = JSON.stringify(pub);
    for (const privado of ["Residente Ficticia", "11.111.111-1", "OP-777", "101"]) assert.ok(!texto.includes(privado), `no expone ${privado}`);
    assert.equal(await consultaPublicaConstancia("codigo-que-no-existe-0000"), null);

    // El PDF de cada versión se genera.
    for (const x of v) {
      const pdf = await pdfConstancia(x.datos as unknown as DatosConstancia, x.huella, "https://ejemplo.invalid/verificar-pago/x", x.version === 3);
      assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    }
  });

  test("constancia: rechazo y vuelta a revisión agregan versiones; sin cambios no se repite", async () => {
    const e = await escenario();
    const t = await e.informar(e.r1, e.u1.id, 20000);
    await cambiarEstadoTransferencia(e.admin, { transferenciaId: t.id, estado: "EN_REVISION", nota: "Buscando en la cartola" });
    await cambiarEstadoTransferencia(e.admin, { transferenciaId: t.id, estado: "RECHAZADA", nota: "No aparece en la cartola" });
    const v = await db.constanciaVersion.findMany({ where: { constancia: { transferenciaId: t.id } }, orderBy: { version: "asc" } });
    assert.deepEqual(v.map((x) => x.estado), ["INFORMADA", "EN_REVISION", "RECHAZADA"]);
    assert.equal((v[2].datos as unknown as DatosConstancia).nota, "No aparece en la cartola");
    // Folios distintos para transferencias distintas.
    const t2 = await e.informar(e.r2, e.u2.id, 20000);
    const [c1, c2] = await Promise.all([t, t2].map((x) => db.constanciaPago.findUniqueOrThrow({ where: { transferenciaId: x.id } })));
    assert.notEqual(c1.folio, c2.folio);
    assert.notEqual(c1.codigo, c2.codigo);
  });
});
