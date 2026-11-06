// Día de pago por unidad: cada unidad vence el día que tiene asignado (o el de la propiedad),
// y la mora y el interés se calculan desde esa fecha. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { emitirPeriodo, morosidad } from "../src/lib/cobro-servicio";

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

const dia = (d: Date) => d.toISOString().slice(0, 10);

describe("día de pago por unidad", () => {
  test("cada aviso vence el día de su unidad y el interés solo corre desde esa fecha", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba día de pago ${Date.now()}` } });
    creadas.push(adm.id);
    const c = await db.condominio.create({
      data: {
        administradoraId: adm.id,
        nombre: "Condominio Ficticio",
        direccion: "Calle 9",
        estado: "HABILITADA_FINANCIERA",
        diaVencimiento: 10,
        tasaInteresMora: 2,
        porcentajeReserva: 0,
      },
    });
    const general = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "1", alicuota: 50 } });
    const dia5 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "2", alicuota: 25, diaPago: 5 } });
    const dia31 = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "3", alicuota: 25, diaPago: 31 } });

    // Octubre 2020: vence en noviembre (30 días). Ya pasó, así que todo queda vencido.
    const oct = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: 2020, mes: 10 } });
    await db.gasto.create({
      data: { administradoraId: adm.id, periodoId: oct.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 100000, fecha: new Date("2020-10-05") },
    });
    assert.equal(await emitirPeriodo(oct.id, adm.id), 3);
    const avisos = await db.avisoCobro.findMany({ where: { periodoId: oct.id } });
    const de = (id: string) => avisos.find((a) => a.unidadId === id)!;
    assert.equal(dia(de(general.id).vencimiento), "2020-11-10");
    assert.equal(dia(de(dia5.id).vencimiento), "2020-11-05");
    assert.equal(dia(de(dia31.id).vencimiento), "2020-11-30"); // noviembre tiene 30 días
    assert.equal(dia((await db.periodo.findUniqueOrThrow({ where: { id: oct.id } })).vencimiento!), "2020-11-10");

    // Morosidad: cada unidad aparece desde su propia fecha.
    const moro = await morosidad(c.id, adm.id);
    assert.equal(moro.length, 3);
    assert.equal(dia(moro.find((m) => m.unidadId === dia5.id)!.desde), "2020-11-05");

    // El período del mes pasado vence este mes. La unidad cuyo día ya pasó queda morosa; la
    // que paga más adelante en el mes todavía no, aunque la deuda sea del mismo período.
    const hoy = new Date();
    const d = hoy.getUTCDate();
    if (d < 2 || d > 27) return; // en los extremos del mes no hay un día antes y otro después
    const mesActual = hoy.getUTCMonth() + 1;
    const [anioP, mesP] = mesActual === 1 ? [hoy.getUTCFullYear() - 1, 12] : [hoy.getUTCFullYear(), mesActual - 1];
    await db.unidad.update({ where: { id: dia5.id }, data: { diaPago: d - 1 } });
    await db.unidad.update({ where: { id: dia31.id }, data: { diaPago: d + 1 } });
    await db.avisoCobro.updateMany({ where: { periodoId: oct.id, unidadId: { in: [dia5.id, dia31.id] } }, data: { saldo: 0 } });
    const mesPasado = await db.periodo.create({ data: { administradoraId: adm.id, condominioId: c.id, anio: anioP, mes: mesP } });
    await db.gasto.create({
      data: { administradoraId: adm.id, periodoId: mesPasado.id, tipo: "COMUN", categoria: "Aseo", descripcion: "Aseo", monto: 100000, fecha: new Date(Date.UTC(anioP, mesP - 1, 5)) },
    });
    await emitirPeriodo(mesPasado.id, adm.id);
    const ids = (await morosidad(c.id, adm.id)).map((m) => m.unidadId);
    assert.ok(ids.includes(dia5.id), "la unidad cuyo día ya pasó está morosa");
    assert.ok(!ids.includes(dia31.id), "la unidad que paga más adelante todavía no está morosa");
  });
});
