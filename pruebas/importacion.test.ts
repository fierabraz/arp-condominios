// COM-001 · Entrega 4: carga desde Excel contra la base. Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { db } from "../src/lib/db";
import type { UsuarioActual } from "../src/lib/auth";
import { aplicarImportacion, leerArchivo, planDe, tamanoDescomprimido } from "../src/lib/importacion-servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await db.vinculoUnidad.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

async function propiedad() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba carga ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Condominio Ficticio", direccion: "Calle 4" } });
  const autor = { id: "prueba", nombre: "Prueba", administradoraId: adm.id } as UsuarioActual;
  return { adm, c, autor };
}

const xlsx = async (nombre: string, data: (string | number | null)[][]) =>
  new File(
    [new Uint8Array(await writeXlsxFile([{ sheet: "Unidades", data: data.map((f) => f.map((value) => (value === null ? null : { value }))) }]).toBuffer())],
    nombre,
  );

const PROPIA = [
  ["Dpto.", "% Part.", "Titular", "RUT titular", "Calidad", "Fecha ingreso"],
  ["11", 60, "Ana Ficticia", "11.111.111-1", "Dueña", "01-03-2024"],
  ["12", 40, "Luis Ficticio", "22.222.222-2", "Arrendatario", "15-01-2026"],
  ["12", 40, "Eva Ficticia", "33.333.333-3", "Ocupante", ""],
];

describe("carga desde Excel (COM-001 · Entrega 4)", () => {
  test("planilla propia con perfil: crea vínculos con fecha, la foto de hoy y no duplica al volver a subir", async () => {
    const { adm, c, autor } = await propiedad();
    // Sin perfil no se reconoce la columna de la unidad.
    const sin = await leerArchivo(await xlsx("propia.xlsx", PROPIA), adm.id);
    assert.equal(sin.sinTitulos, true);
    assert.equal(sin.hoja?.nombre, "Unidades");

    await db.perfilImportacion.create({
      data: {
        administradoraId: adm.id,
        nombre: "Planilla antigua",
        columnas: { dpto: "numero", part: "alicuota", titular: "nombre", ruttitular: "documento", calidad: "relacion", fechaingreso: "desde" },
        creadoPor: "Prueba",
      },
    });
    const con = await leerArchivo(await xlsx("propia.xlsx", PROPIA), adm.id);
    assert.equal(con.perfil?.nombre, "Planilla antigua");
    assert.deepEqual(con.errores, []);
    const r = await aplicarImportacion(autor, adm.id, c.id, con.filas);
    assert.ok(r.ok);
    const vinculos = await db.vinculoUnidad.findMany({ where: { administradoraId: adm.id }, include: { persona: true }, orderBy: { tipo: "asc" } });
    assert.deepEqual(
      vinculos.map((v) => [v.persona.nombre, v.tipo, v.desde?.toISOString().slice(0, 10) ?? null]),
      [
        ["Ana Ficticia", "PROPIETARIO", "2024-03-01"],
        ["Luis Ficticio", "ARRENDATARIO", "2026-01-15"],
        ["Eva Ficticia", "OCUPANTE", null],
      ],
    );
    // El ocupante queda registrado pero no da relación (sin acceso a la app ni cobros).
    assert.deepEqual(
      (await db.unidadPersona.findMany({ where: { unidad: { condominioId: c.id } }, select: { relacion: true } })).map((x) => x.relacion).sort(),
      ["PROPIETARIO", "RESIDENTE"],
    );
    // Volver a subir el mismo archivo no cambia nada.
    const otra = await leerArchivo(await xlsx("propia.xlsx", PROPIA), adm.id);
    const plan = await planDe(otra.filas, c.id, adm.id);
    assert.deepEqual(plan.errores, []);
    assert.equal(plan.vinculos.filter((v) => v.nuevo).length, 0);
    assert.equal(plan.personas.filter((p) => p.accion === "crear").length, 0);
  });

  test("los perfiles no se comparten entre administradoras", async () => {
    const a = await propiedad();
    const b = await propiedad();
    await db.perfilImportacion.create({
      data: { administradoraId: a.adm.id, nombre: "De A", columnas: { dpto: "numero", titular: "nombre" }, creadoPor: "Prueba" },
    });
    assert.equal((await leerArchivo(await xlsx("p.xlsx", PROPIA), a.adm.id)).perfil?.nombre, "De A");
    const enB = await leerArchivo(await xlsx("p.xlsx", PROPIA), b.adm.id);
    assert.equal(enB.perfil, undefined);
    assert.equal(enB.sinTitulos, true);
  });

  test("una carga con una fila que contradice lo vigente no guarda nada", async () => {
    const { adm, c, autor } = await propiedad();
    const archivo = await xlsx("oficial.xlsx", [
      ["Unidad", "Alícuota (%)", "Nombre", "RUT", "Relación"],
      ["21", 50, "Pía Ficticia", "44.444.444-4", "Propietario"],
      ["21", 50, "Tomás Ficticio", "55.555.555-5", "Propietario"],
    ]);
    const lectura = await leerArchivo(archivo, adm.id);
    const r = await aplicarImportacion(autor, adm.id, c.id, lectura.filas);
    assert.equal(r.ok, false);
    assert.match(r.plan.errores[0].mensaje, /ya figura como propietario/);
    assert.equal(await db.unidad.count({ where: { condominioId: c.id } }), 0);
    assert.equal(await db.persona.count({ where: { administradoraId: adm.id } }), 0);
  });

  test("seguridad del archivo: tipo real, formato antiguo y CSV binario", async () => {
    const falso = await leerArchivo(new File([new TextEncoder().encode("Unidad;Nombre\n1;Ana")], "truco.xlsx"));
    assert.match(falso.errores[0].mensaje, /no es una planilla de Excel/);
    const xls = await leerArchivo(new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "vieja.xls"));
    assert.match(xls.errores[0].mensaje, /formato antiguo/);
    const binario = await leerArchivo(new File([new Uint8Array([85, 0, 1, 2])], "datos.csv"));
    assert.match(binario.errores[0].mensaje, /no es un CSV/);
    const exe = await leerArchivo(new File([new Uint8Array([77, 90])], "programa.exe"));
    assert.match(exe.errores[0].mensaje, /\.xlsx/);
    const bueno = Buffer.from(await (await xlsx("ok.xlsx", [["Unidad"], ["1"]])).arrayBuffer());
    assert.ok(tamanoDescomprimido(bueno)! > 0);
    assert.equal(tamanoDescomprimido(Buffer.from("PK no es zip")), null);
  });
});
