// SEG-20: una persona en uso (unidad, vínculo o cuenta) no se borra, aunque se intente directo.
import "dotenv/config";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { sinUso } from "../src/lib/personas";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
after(async () => {
  await db.usuario.deleteMany({ where: { administradoraId: { in: creadas } } });
  await db.administradora.deleteMany({ where: { id: { in: creadas } } });
  await db.$disconnect();
});

describe("eliminar personas (SEG-20)", () => {
  test("con cuenta o en una unidad no se borra; sin uso, sí", async () => {
    const adm = await db.administradora.create({ data: { nombre: `Prueba personas ${Date.now()}` } });
    creadas.push(adm.id);
    const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Edificio", direccion: "Calle 1" } });
    const u = await db.unidad.create({ data: { administradoraId: adm.id, condominioId: c.id, numero: "101", alicuota: 100 } });
    const nueva = (nombre: string) => db.persona.create({ data: { administradoraId: adm.id, nombre } });
    const [conCuenta, enUnidad, libre] = await Promise.all([nueva("Con cuenta"), nueva("En unidad"), nueva("Libre")]);
    await db.usuario.create({
      data: { administradoraId: adm.id, nombre: "Con cuenta", correo: `cuenta-${Date.now()}@prueba.test`, claveHash: "x", rol: "RESIDENTE", personaId: conCuenta.id },
    });
    await db.unidadPersona.create({ data: { unidadId: u.id, personaId: enUnidad.id, relacion: "PROPIETARIO" } });

    const borrar = (id: string) => db.persona.deleteMany({ where: { id, administradoraId: adm.id, ...sinUso } });
    assert.equal((await borrar(conCuenta.id)).count, 0);
    assert.equal((await borrar(enUnidad.id)).count, 0);
    assert.equal((await borrar(libre.id)).count, 1);
  });
});
