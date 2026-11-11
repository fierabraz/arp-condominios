// FIN-003.1 · Importador de cartolas contra la base, con las cartolas FICTICIAS de pruebas/cartolas/.
// Solo contra una base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import type { UsuarioActual } from "../src/lib/auth";
import { confirmarCartola, revisarCartola, type CuentaDeCartola } from "../src/lib/cartolas-servicio";
import type { EstadoCartola, OpcionesEnvio } from "../src/lib/cartolas";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
before(async () => {
  await db.$connect();
});
after(async () => {
  for (const id of creadas) {
    await db.movimientoBancario.deleteMany({ where: { administradoraId: id } });
    await db.importacionCartola.deleteMany({ where: { administradoraId: id } });
    await db.administradora.delete({ where: { id } });
  }
  await db.$disconnect();
});

async function escenario() {
  const adm = await db.administradora.create({ data: { nombre: `Prueba cartolas ${Date.now()}-${Math.random()}` } });
  creadas.push(adm.id);
  const c = await db.condominio.create({ data: { administradoraId: adm.id, nombre: "Edificio Ficticio", direccion: "Calle 1" } });
  const cuenta = await db.cuentaBancaria.create({
    data: { administradoraId: adm.id, condominioId: c.id, banco: "Banco Ficticio", numeroFinal: "4521", creadoPor: "Prueba" },
  });
  const autor = { id: "prueba", nombre: "Prueba", administradoraId: adm.id } as UsuarioActual;
  const datosCuenta: CuentaDeCartola = { id: cuenta.id, banco: cuenta.banco, numeroFinal: cuenta.numeroFinal, condominioId: c.id, administradoraId: adm.id };
  return { adm, c, cuenta: datosCuenta, autor };
}

const archivo = (nombre: string) => new File([new Uint8Array(readFileSync(join(__dirname, "cartolas", nombre)))], nombre);
const A = () => archivo("cartola-a-octubre-1-al-15.xlsx");
const B = () => archivo("cartola-b-octubre-completo.csv");
const C = () => archivo("cartola-c-noviembre.csv");

type Revision = Extract<EstadoCartola, { etapa: "revision" }>;
function revision(e: EstadoCartola): Revision {
  assert.equal(e.etapa, "revision", JSON.stringify(e).slice(0, 400));
  return e as Revision;
}
const esperado = (r: Revision) => ({ nuevos: r.resumen.nuevos, registrados: r.resumen.registrados, porRevisar: r.resumen.porRevisar });
const MAPEO_B: OpcionesEnvio["mapeo"] = {
  fcontable: "fecha",
  glosadelmovimiento: "descripcion",
  nroop: "referencia",
  debitosgiros: "cargo",
  creditosdepositos: "abono",
  saldodiario: "saldo",
};

describe("FIN-003.1 · importador de cartolas", () => {
  test("Prueba A: se reconoce sola, lista las dos hojas y comprueba los saldos", async () => {
    const { cuenta, autor } = await escenario();
    const r = revision(await revisarCartola(autor, cuenta, A(), {}));
    assert.deepEqual(r.resumen, { encontrados: 13, nuevos: 13, registrados: 0, porRevisar: 0, errores: 0 });
    assert.deepEqual(r.periodo, { desde: "2026-10-01", hasta: "2026-10-15" });
    assert.deepEqual(
      r.hojas.map((h) => [h.nombre, h.reconocida, h.elegida]),
      [
        ["Movimientos", true, true],
        ["Resumen", false, false],
      ],
    );
    assert.ok(r.avisos.some((a) => a.includes("cuadran con los cargos y abonos")));
    assert.ok(r.avisos.some((a) => a.includes("se dejaron fuera 3 filas")));
    assert.equal(r.archivo.formato, "XLSX");
    assert.equal(r.archivo.huella.length, 64);
    // Nada se guardó todavía.
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 0);
  });

  test("confirmar A, volver a subirla (nada nuevo) y luego B con asistente, perfil y duplicados; C reutiliza el perfil", async () => {
    const { cuenta, autor, adm } = await escenario();
    const ra = revision(await revisarCartola(autor, cuenta, A(), {}));
    const listoA = await confirmarCartola(autor, cuenta, A(), { esperado: esperado(ra) });
    assert.equal(listoA.etapa, "listo");
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 13);
    const imp = await db.importacionCartola.findFirstOrThrow({ where: { cuentaId: cuenta.id } });
    assert.equal(imp.nuevos, 13);
    assert.equal(imp.usuarioNombre, "Prueba");
    assert.ok(await db.registroCambio.findFirst({ where: { entidad: "ImportacionCartola", entidadId: imp.id } }));

    // Mismo archivo otra vez: todo ya registrado y no se puede confirmar como nuevo.
    const otraVez = revision(await revisarCartola(autor, cuenta, A(), {}));
    assert.deepEqual(otraVez.resumen, { encontrados: 13, nuevos: 0, registrados: 13, porRevisar: 0, errores: 0 });
    assert.ok(otraVez.yaImportado);
    const repetida = await confirmarCartola(autor, cuenta, A(), { esperado: esperado(otraVez) });
    assert.equal(repetida.etapa, "revision");
    assert.match((repetida as Revision).mensaje!, /No hay movimientos nuevos/);
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 13);
    assert.equal(await db.importacionCartola.count({ where: { cuentaId: cuenta.id } }), 1);

    // B: otras columnas → asistente.
    const sinPerfil = await revisarCartola(autor, cuenta, B(), {});
    assert.equal(sinPerfil.etapa, "columnas");
    if (sinPerfil.etapa !== "columnas") return;
    assert.ok(sinPerfil.faltan.includes("la fecha"));
    assert.deepEqual(sinPerfil.columnas.map((c) => c.titulo), ["F. Contable", "Glosa del Movimiento", "Nro. Op.", "Débitos/Giros", "Créditos/Depósitos", "Saldo Diario"]);
    assert.deepEqual(sinPerfil.columnas[0].ejemplos, ["01-oct-2026", "01-oct-2026", "02-oct-2026"]);

    const opcionesB: OpcionesEnvio = { mapeo: MAPEO_B, formatos: { fecha: "AUTO", decimal: "AUTO", signo: "POSITIVO_ABONO" } };
    const rb = revision(await revisarCartola(autor, cuenta, B(), { ...opcionesB, guardarPerfil: { nombre: "Cartola CSV cuenta corriente", banco: "Banco Ficticio" } }));
    assert.equal(rb.perfilGuardado, "Cartola CSV cuenta corriente");
    assert.deepEqual(rb.resumen, { encontrados: 21, nuevos: 8, registrados: 12, porRevisar: 1, errores: 0 });
    const posible = rb.filas.find((f) => f.estado === "POSIBLE_DUPLICADO")!;
    assert.equal(posible.descripcion, "DEPOSITO EN EFECTIVO CAJA");
    assert.equal(posible.parecido?.descripcion, "DEPOSITO EN EFECTIVO CAJA");
    // Misma fecha y monto (120.000 el 05-10) pero con referencia: se reconoce por la referencia, no por el monto.
    assert.equal(rb.filas.find((f) => f.referencia === "7001350")?.estado, "REGISTRADO");
    assert.ok(rb.avisos.some((a) => a.includes("cuadran con los cargos y abonos")), rb.avisos.join("\n"));

    // Sin decidir el posible duplicado no se guarda.
    const sinDecidir = await confirmarCartola(autor, cuenta, B(), { ...opcionesB, esperado: esperado(rb) });
    assert.match((sinDecidir as Revision).mensaje!, /Decide qué hacer/);
    const listoB = await confirmarCartola(autor, cuenta, B(), { ...opcionesB, esperado: esperado(rb), decisiones: { [posible.huella]: "omitir" } });
    assert.equal(listoB.etapa, "listo");
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 21);
    const impB = await db.importacionCartola.findFirstOrThrow({ where: { cuentaId: cuenta.id }, orderBy: { creadoEn: "desc" } });
    assert.deepEqual([impB.nuevos, impB.yaRegistrados, impB.posiblesDuplicados, impB.duplicadosOmitidos, impB.perfilNombre], [8, 12, 1, 1, null]);

    // El perfil guardado no tiene movimientos ni datos personales: solo títulos y formatos.
    const perfil = await db.perfilCartola.findFirstOrThrow({ where: { administradoraId: adm.id } });
    assert.deepEqual(perfil.columnas, MAPEO_B);
    assert.equal(JSON.stringify(perfil).includes("CAMILA"), false);

    // C (mismo formato que B): el perfil se aplica solo.
    const rc = revision(await revisarCartola(autor, cuenta, C(), {}));
    assert.equal(rc.perfil?.nombre, "Cartola CSV cuenta corriente");
    assert.deepEqual(rc.resumen, { encontrados: 5, nuevos: 5, registrados: 0, porRevisar: 0, errores: 0 });
    // B otra vez, ahora reconocida por el perfil: nada nuevo.
    const rb2 = revision(await revisarCartola(autor, cuenta, B(), {}));
    assert.equal(rb2.perfil?.nombre, "Cartola CSV cuenta corriente");
    assert.equal(rb2.resumen.nuevos, 0);
  });

  test("errores bloquean el lote salvo que se pida explícitamente dejarlos fuera", async () => {
    const { cuenta, autor } = await escenario();
    const csv = "Fecha;Descripción;Cargos;Abonos\n01/10/2026;Buena;;1.000\n02/10/2026;Mala;12,34,5;\n03/10/2026;Otra buena;500;\n";
    const f = () => new File([csv], "con-error.csv");
    const r = revision(await revisarCartola(autor, cuenta, f(), {}));
    assert.deepEqual(r.resumen, { encontrados: 3, nuevos: 2, registrados: 0, porRevisar: 0, errores: 1 });
    assert.deepEqual(r.errores[0].fila, 3);
    const bloqueado = await confirmarCartola(autor, cuenta, f(), { esperado: esperado(r) });
    assert.match((bloqueado as Revision).mensaje!, /filas con error/);
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 0);
    const listo = await confirmarCartola(autor, cuenta, f(), { esperado: esperado(r), omitirErrores: true });
    assert.equal(listo.etapa, "listo");
    const imp = await db.importacionCartola.findFirstOrThrow({ where: { cuentaId: cuenta.id } });
    assert.equal(imp.errores, 1);
    assert.equal((imp.detalleErrores as { fila: number }[])[0].fila, 3);
  });

  test("dos importaciones simultáneas de la misma cartola: solo una guarda los movimientos", async () => {
    const { cuenta, autor } = await escenario();
    const r = revision(await revisarCartola(autor, cuenta, A(), {}));
    const resultados = await Promise.all([
      confirmarCartola(autor, cuenta, A(), { esperado: esperado(r) }),
      confirmarCartola(autor, cuenta, A(), { esperado: esperado(r) }),
    ]);
    assert.equal(resultados.filter((x) => x.etapa === "listo").length, 1);
    assert.equal(await db.movimientoBancario.count({ where: { cuentaId: cuenta.id } }), 13);
    assert.equal(await db.importacionCartola.count({ where: { cuentaId: cuenta.id } }), 1);
  });

  test("la base impide guardar el mismo movimiento dos veces y montos en cero", async () => {
    const { cuenta, autor } = await escenario();
    const r = revision(await revisarCartola(autor, cuenta, A(), {}));
    await confirmarCartola(autor, cuenta, A(), { esperado: esperado(r) });
    const m = await db.movimientoBancario.findFirstOrThrow({ where: { cuentaId: cuenta.id } });
    const copia = { ...m, id: undefined, creadoEn: undefined, otros: undefined };
    await assert.rejects(db.movimientoBancario.create({ data: copia }));
    await assert.rejects(db.movimientoBancario.create({ data: { ...copia, huella: "otra", monto: 0 } }));
    await assert.rejects(db.movimientoBancario.update({ where: { id: m.id }, data: { montoConciliado: Number(m.monto) * 2 } }));
    await assert.rejects(db.cuentaBancaria.create({ data: { administradoraId: cuenta.administradoraId, condominioId: cuenta.condominioId, banco: "X", numeroFinal: "123456789", creadoPor: "x" } }));
  });

  test("los perfiles de una administradora no se aplican en otra", async () => {
    const uno = await escenario();
    await revisarCartola(uno.autor, uno.cuenta, B(), { mapeo: MAPEO_B, guardarPerfil: { nombre: "Perfil privado", banco: "Banco Ficticio" } });
    const otro = await escenario();
    const r = await revisarCartola(otro.autor, otro.cuenta, B(), {});
    assert.equal(r.etapa, "columnas");
  });

  test("rechaza archivos que no son cartolas: PDF, xlsx falso, libros con macros", async () => {
    const { cuenta, autor } = await escenario();
    const pdf = await revisarCartola(autor, cuenta, new File(["%PDF-1.4"], "cartola.pdf"), {});
    assert.match((pdf as { mensaje: string }).mensaje, /PDF/);
    const falso = await revisarCartola(autor, cuenta, new File(["hola"], "cartola.xlsx"), {});
    assert.match((falso as { mensaje: string }).mensaje, /no es una planilla/);
    const xlsm = await revisarCartola(autor, cuenta, new File(["PK"], "cartola.xlsm"), {});
    assert.match((xlsm as { mensaje: string }).mensaje, /macros/);
  });
});
