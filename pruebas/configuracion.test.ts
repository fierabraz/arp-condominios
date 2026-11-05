// COM-001 · Entrega 1: una propiedad en configuración no emite cobros ni registra pagos,
// y su estado se calcula con los datos guardados. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { emitirPeriodo, ErrorCobro, registrarPago } from "../src/lib/cobro-servicio";
import { datosDeUna } from "../src/lib/configuracion-servicio";
import { revisarCambio } from "../src/lib/configuracion";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];

before(async () => {
  await db.$connect();
});

after(async () => {
  await db.administradora.deleteMany({ where: { id: { in: creadas } } });
  await db.$disconnect();
});

describe("estado de la comunidad (COM-001)", () => {
  test("una propiedad nueva nace en configuración y no permite cobrar ni registrar pagos", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba configuración ${Date.now()}` } });
    creadas.push(adm.id);
    const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Condominio Ficticio", direccion: "Calle 9" } });
    assert.equal(c.estado, "EN_CONFIGURACION");

    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "1", alicuota: 100 } });
    const periodo = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2026, mes: 12 } });

    await assert.rejects(emitirPeriodo(periodo.id, adm.id), (e) => e instanceof ErrorCobro && /habilitada financieramente/.test(e.message));
    await assert.rejects(
      registrarPago(adm.id, { unidadId: u.id, monto: 1000, fecha: new Date(), medio: "EFECTIVO" }),
      (e) => e instanceof ErrorCobro,
    );
    assert.equal(await db.avisoCobro.count({ where: { periodoId: periodo.id } }), 0);
    assert.equal(await db.pago.count({ where: { unidadId: u.id } }), 0);

    // Con la identificación completa y alícuotas al 100 % ya se puede habilitar; al habilitarla, cobra.
    await db.condominio.update({
      where: { id: c.id },
      data: { tipo: "CONDOMINIO_CASAS", modalidad: "NUEVA", fechaIncorporacion: new Date("2026-12-01") },
    });
    const datos = (await datosDeUna(adm.id, c.id))!;
    assert.equal(datos.unidades, 1);
    assert.equal(datos.sumaAlicuotas, 100);
    assert.equal(datos.unidadesSinPropietario, 1);
    assert.equal(revisarCambio(datos, "HABILITADA_FINANCIERA").ok, true);

    await db.condominio.update({ where: { id: c.id }, data: { estado: "HABILITADA_FINANCIERA" } });
    await db.gasto.create({
      data: { administradoraId: adm.id, periodoId: periodo.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 5000, fecha: new Date("2026-12-05") },
    });
    assert.equal(await emitirPeriodo(periodo.id, adm.id), 1);

    // Ya cobró: no puede volver atrás.
    const despues = (await datosDeUna(adm.id, c.id))!;
    assert.equal(revisarCambio(despues, "HABILITADA_ADMINISTRATIVA").ok, false);
  });
});
