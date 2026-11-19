// FIN-003.3 · Verificación automática de transferencias informadas con la cartola (datos ficticios).
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { borrarConstancias } from "./limpieza";
import { emitirPeriodo, estadoCuenta, registrarPago } from "../src/lib/cobro-servicio";
import { cambiarEstadoTransferencia, informarTransferencia } from "../src/lib/transferencias-servicio";
import { reversarTransferencia } from "../src/lib/conciliacion-servicio";
import { cambiarVerificacionAutomatica, verificarConCartola } from "../src/lib/verificacion-automatica-servicio";
import type { UsuarioActual } from "../src/lib/auth";

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

async function escenario(activa = true) {
  const adm = await db.administradora.create({ data: { nombre: `Prueba FIN-003.3 ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({
    data: { administradoraId: adm.id, nombre: "Comunidad Ficticia", direccion: "Calle 1", estado: "HABILITADA_FINANCIERA", porcentajeReserva: 0 },
  });
  const unidades: { id: string }[] = [];
  const residentes: UsuarioActual[] = [];
  for (const numero of ["101", "102", "103", "104"]) {
    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero, alicuota: 25 } });
    const persona = await db.persona.create({ data: { administradoraId: adm.id, nombre: `Residente Ficticia ${numero}` } });
    await db.unidadPersona.create({ data: { unidadId: u.id, personaId: persona.id, relacion: "RESIDENTE" } });
    const fila = await db.usuario.create({
      data: { administradoraId: adm.id, nombre: persona.nombre, correo: `r${numero}-${adm.id}@prueba.cl`, claveHash: "x", rol: "RESIDENTE", personaId: persona.id },
    });
    unidades.push(u);
    residentes.push({
      id: fila.id, nombre: fila.nombre, correo: fila.correo, rol: "RESIDENTE", administradoraId: adm.id, condominioId: null, personaId: persona.id,
      accesoTodas: false, asignados: [], administradora: { nombre: adm.nombre, moneda: "CLP" },
    } as UsuarioActual);
  }
  const admin = { id: "admin-prueba", nombre: "Administradora Ficticia", administradoraId: adm.id };
  if (activa) await cambiarVerificacionAutomatica(admin, c.id, true);
  // Septiembre y octubre: 200.000 cada mes → 50.000 por unidad y mes.
  for (const mes of [9, 10]) {
    const p = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes } });
    await db.gasto.create({ data: { administradoraId: adm.id, periodoId: p.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 200000, fecha: dia(`2026-${String(mes).padStart(2, "0")}-15`) } });
    await emitirPeriodo(p.id, adm.id);
  }
  const cuenta = await db.cuentaBancaria.create({
    data: { administradoraId: adm.id, condominioId: c.id, banco: "Banco Ficticio", tipo: "CORRIENTE", numeroFinal: "4321", creadoPor: "Prueba" },
  });
  let n = 0;
  /** Simula la carga de una cartola: crea la importación y sus movimientos. */
  const cartola = async (filas: { fecha: string; monto: number; referencia?: string; descripcion?: string; estado?: "PENDIENTE" | "REVISAR" }[]) => {
    const imp = await db.importacionCartola.create({
      data: {
        administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, banco: cuenta.banco, archivoNombre: `cartola-${n}.csv`, archivoHuella: `h${n}`,
        archivoTamano: 1, formato: "CSV", encontrados: filas.length, nuevos: filas.length, yaRegistrados: 0, posiblesDuplicados: 0, duplicadosOmitidos: 0, errores: 0,
        estado: "APLICADA", usuarioNombre: "Prueba",
      },
    });
    const movs = [];
    for (const f of filas) {
      movs.push(
        await db.movimientoBancario.create({
          data: {
            administradoraId: adm.id, condominioId: c.id, cuentaId: cuenta.id, importacionId: imp.id, fecha: dia(f.fecha), monto: f.monto,
            huella: `m${n++}`, referencia: f.referencia ?? null, descripcion: f.descripcion ?? null, estado: f.estado ?? "PENDIENTE",
          },
        }),
      );
    }
    return { imp, movs };
  };
  const informar = (i: number, monto: number, fecha: string, operacion?: string) =>
    informarTransferencia(residentes[i], { unidadId: unidades[i].id, fecha: dia(fecha), monto, operacion }, null, false);
  const transferencia = (id: string) => db.transferenciaInformada.findUniqueOrThrow({ where: { id } });
  return { adm, c, unidades, admin, cartola, informar, transferencia };
}

describe("FIN-003.3 · verificación automática con la cartola", () => {
  test("los tres casos, abonos sin transferencia, resumen y registro de cambios", async () => {
    const e = await escenario();
    const exacta = await e.informar(0, 50000, "2026-11-05", "111111");
    const fechaDistinta = await e.informar(1, 50000, "2026-11-05", "222222");
    const conDiferencias = await e.informar(2, 50000, "2026-11-05", "333333");
    const sinCartola = await e.informar(3, 50000, "2026-11-20", "444444");
    const { imp, movs } = await e.cartola([
      { fecha: "2026-11-05", monto: 50000, referencia: "TEF 111111" },
      { fecha: "2026-11-06", monto: 50000, referencia: "TEF 222222" },
      { fecha: "2026-11-05", monto: 45000, referencia: "TEF 333333" },
      { fecha: "2026-11-05", monto: 80000, descripcion: "DEPOSITO" },
    ]);
    const r = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.ok(r.activa);
    assert.equal(r.revisadas, 4);
    assert.equal(r.verificadas, 1);
    assert.equal(r.porConfirmar, 1);
    assert.equal(r.conDiferencias, 1);
    assert.deepEqual(r.sinTransferencia.map((a) => a.id), [movs[3].id]);

    // 1. Exacta: verificada y conciliada, UN pago aplicado a lo más antiguo (septiembre).
    const t1 = await e.transferencia(exacta.id);
    assert.equal(t1.estado, "CONCILIADA");
    assert.equal(t1.autoResultado, "VERIFICADA");
    assert.equal(t1.movimientoId, movs[0].id);
    const est = (await estadoCuenta(e.unidades[0].id, e.adm.id))!;
    assert.equal(est.deuda, 50000);
    const sep = est.avisos.find((a) => a.periodo.mes === 9)!;
    assert.equal(Number(sep.saldo), 0);
    assert.equal(Number((await db.movimientoBancario.findUniqueOrThrow({ where: { id: movs[0].id } })).montoConciliado), 50000);

    // 2. Fecha distinta: en revisión con el abono sugerido; la deuda no cambia.
    const t2 = await e.transferencia(fechaDistinta.id);
    assert.equal(t2.estado, "EN_REVISION");
    assert.equal(t2.autoResultado, "POR_CONFIRMAR");
    assert.equal(t2.autoMovimientoId, movs[1].id);
    assert.equal((await estadoCuenta(e.unidades[1].id, e.adm.id))!.deuda, 100000);

    // 3. Monto distinto: en revisión «con diferencias», nunca rechazada.
    const t3 = await e.transferencia(conDiferencias.id);
    assert.equal(t3.estado, "EN_REVISION");
    assert.equal(t3.autoResultado, "CON_DIFERENCIAS");

    // 4. Sin abono en la cartola: sigue pendiente de verificación.
    assert.equal((await e.transferencia(sinCartola.id)).estado, "INFORMADA");

    // Registro de cambios como validación automática y resumen guardado.
    const registro = await db.registroCambio.findMany({ where: { administradoraId: e.adm.id, accion: { startsWith: "Validación automática" } } });
    assert.ok(registro.some((x) => x.accion === "Validación automática: verificó y concilió una transferencia" && x.usuarioNombre.startsWith("Validación automática")));
    assert.ok(registro.some((x) => x.accion === "Validación automática con la cartola"));
    const v = await db.verificacionCartola.findFirstOrThrow({ where: { importacionId: imp.id } });
    assert.equal(v.verificadas, 1);
    assert.equal(v.sinTransferencia, 1);

    // Volver a correr no duplica nada: el abono ya se usó y las sugerencias no se repiten.
    const r2 = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.ok(r2.activa);
    assert.equal(r2.verificadas, 0);
    assert.equal(await db.pago.count({ where: { unidadId: e.unidades[0].id } }), 1);
    const historial = await db.registroCambio.count({ where: { entidad: "TransferenciaInformada", entidadId: fechaDistinta.id } });
    const acciones = await db.registroCambio.findMany({ where: { entidad: "TransferenciaInformada", entidadId: fechaDistinta.id }, select: { accion: true } });
    assert.equal(historial, 2, JSON.stringify(acciones)); // informó + dejó por confirmar (la segunda pasada no repite)

    // Se puede reversar con motivo como cualquier pago verificado.
    await reversarTransferencia(e.admin, { condominioId: e.c.id, transferenciaId: exacta.id, motivo: "Prueba de reverso" });
    assert.equal((await e.transferencia(exacta.id)).estado, "ANULADA");
    assert.equal((await estadoCuenta(e.unidades[0].id, e.adm.id))!.deuda, 100000);
  });

  test("desactivada: no cambia nada", async () => {
    const e = await escenario(false);
    const t = await e.informar(0, 50000, "2026-11-05", "111111");
    const { imp } = await e.cartola([{ fecha: "2026-11-05", monto: 50000, referencia: "111111" }]);
    const r = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.equal(r.activa, false);
    assert.equal((await e.transferencia(t.id)).estado, "INFORMADA");
  });

  test("posibles duplicados de la carga no se usan y la decisión manual no se pisa", async () => {
    const e = await escenario();
    const a = await e.informar(0, 50000, "2026-11-05", "111111");
    const b = await e.informar(1, 50000, "2026-11-05", "222222");
    await cambiarEstadoTransferencia(e.admin, { transferenciaId: b.id, estado: "EN_REVISION", nota: "La reviso yo" });
    const { imp } = await e.cartola([
      { fecha: "2026-11-05", monto: 50000, referencia: "111111", estado: "REVISAR" },
      { fecha: "2026-11-05", monto: 50000, referencia: "222222" },
    ]);
    const r = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.ok(r.activa);
    assert.equal(r.verificadas, 0);
    assert.equal((await e.transferencia(a.id)).estado, "INFORMADA");
    const tb = await e.transferencia(b.id);
    assert.equal(tb.estado, "EN_REVISION");
    assert.equal(tb.autoResultado, null);
  });

  test("dos transferencias iguales y un solo abono: nadie se verifica solo y el abono se sugiere una vez", async () => {
    const e = await escenario();
    await e.informar(0, 50000, "2026-11-05");
    await e.informar(1, 50000, "2026-11-05");
    const { imp } = await e.cartola([{ fecha: "2026-11-05", monto: 50000 }]);
    const r = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.ok(r.activa);
    assert.equal(r.verificadas, 0);
    assert.equal(r.porConfirmar, 1);
  });

  test("mes cerrado o pago ya registrado a mano: no se fuerza, queda por confirmar", async () => {
    const e = await escenario();
    await registrarPago(e.adm.id, { unidadId: e.unidades[0].id, monto: 50000, fecha: dia("2026-11-05"), medio: "TRANSFERENCIA" });
    const t = await e.informar(0, 50000, "2026-11-05", "111111");
    const { imp } = await e.cartola([{ fecha: "2026-11-05", monto: 50000, referencia: "111111" }]);
    const r = await verificarConCartola(e.admin, e.c.id, imp.id);
    assert.ok(r.activa);
    assert.equal(r.verificadas, 0);
    assert.equal(r.porConfirmar, 1);
    const tt = await e.transferencia(t.id);
    assert.equal(tt.estado, "EN_REVISION");
    assert.match(tt.autoMotivos ?? "", /ya tiene un pago/);
    assert.equal(await db.pago.count({ where: { unidadId: e.unidades[0].id, anuladoEn: null } }), 1);
  });
});
