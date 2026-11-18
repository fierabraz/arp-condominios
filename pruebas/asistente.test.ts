// IA-002 · Asistente de ayuda contra la base: permisos de las herramientas, límites y la vuelta
// pregunta → herramienta → respuesta con un servicio de IA FALSO (local). Solo base de PRUEBA: npm run test:bd
import "dotenv/config";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { db } from "../src/lib/db";
import type { UsuarioActual } from "../src/lib/auth";
import { ejecutarHerramienta, herramientasPara } from "../src/lib/asistente/herramientas";
import { preguntarAlAsistente } from "../src/lib/asistente/servicio";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}

const creadas: string[] = [];
let servidor: Server;
/** Lo que recibió el servicio de IA falso en cada llamada. */
const recibidas: { tools: { name: string }[]; messages: { role: string; content: unknown }[]; system: { text: string }[] }[] = [];

function usuario(datos: Partial<UsuarioActual> & Pick<UsuarioActual, "rol">): UsuarioActual {
  return {
    id: `u-${Math.random().toString(36).slice(2)}`,
    nombre: "Cuenta de Prueba",
    correo: "prueba@ejemplo.cl",
    administradoraId: null,
    condominioId: null,
    personaId: null,
    accesoTodas: false,
    administradora: { nombre: "Adm", moneda: "CLP" },
    asignados: [],
    ...datos,
  } as UsuarioActual;
}

let A: string, B: string, c1: string, c2: string, c3: string, personaId: string;

before(async () => {
  await db.$connect();
  const sufijo = Date.now();
  const admA = await db.administradora.create({ data: { nombre: `Prueba asistente A ${sufijo}` } });
  const admB = await db.administradora.create({ data: { nombre: `Prueba asistente B ${sufijo}` } });
  creadas.push(admA.id, admB.id);
  A = admA.id;
  B = admB.id;
  const crear = (administradoraId: string, nombre: string) =>
    db.condominio.create({ data: { administradoraId, nombre, direccion: "Calle Ficticia 1", estado: "HABILITADA_FINANCIERA" } });
  c1 = (await crear(A, "Comunidad Uno")).id;
  c2 = (await crear(A, "Comunidad Dos")).id;
  c3 = (await crear(B, "Comunidad Ajena")).id;
  const unidad = (administradoraId: string, condominioId: string, numero: string) =>
    db.unidad.create({ data: { administradoraId, condominioId, numero, alicuota: 50 } });
  const u101 = await unidad(A, c1, "101");
  await unidad(A, c1, "102");
  await unidad(A, c2, "201");
  await unidad(B, c3, "301");
  const periodo = await db.periodo.create({ data: { administradoraId: A, condominioId: c1, anio: 2026, mes: 9, estado: "CERRADO" } });
  await db.avisoCobro.create({
    data: {
      administradoraId: A,
      periodoId: periodo.id,
      unidadId: u101.id,
      gastoComun: 80000,
      fondoReserva: 4000,
      cargos: 0,
      total: 84000,
      saldo: 84000,
      vencimiento: new Date("2026-10-10T03:00:00Z"),
    },
  });
  const persona = await db.persona.create({
    data: { administradoraId: A, nombre: "Residente Ficticia", documento: "11.111.111-1", correo: "ficticia@ejemplo.cl", telefono: "+56900000000" },
  });
  personaId = persona.id;
  await db.unidadPersona.create({ data: { unidadId: u101.id, personaId, relacion: "PROPIETARIO" } });

  // Servicio de IA falso: la 1ª llamada pide una herramienta; la 2ª responde con texto.
  servidor = createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      const pedido = JSON.parse(cuerpo);
      recibidas.push(pedido);
      const ultima = pedido.messages.at(-1);
      const conResultado = Array.isArray(ultima.content) && ultima.content.some((b: { type: string }) => b.type === "tool_result");
      const herramienta = pedido.tools[0]?.name;
      const contenido =
        !conResultado && herramienta
          ? [{ type: "tool_use", id: "toolu_1", name: herramienta, input: {} }]
          : [{ type: "text", text: "Respuesta de prueba." }];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: pedido.model,
          content: contenido,
          stop_reason: contenido[0].type === "tool_use" ? "tool_use" : "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 },
        }),
      );
    });
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = (servidor.address() as { port: number }).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${puerto}`;
  process.env.ANTHROPIC_API_KEY = "sk-ant-prueba-falsa";
  process.env.ASISTENTE_LIMITE_DIARIO = "2";
});

after(async () => {
  servidor?.close();
  await db.consultaAsistente.deleteMany({ where: { administradoraId: { in: creadas } } });
  for (const id of creadas) await db.administradora.delete({ where: { id } });
  await db.$disconnect();
});

const json = (x: unknown) => JSON.stringify(x);

describe("IA-002 · herramientas: cada cuenta ve solo lo suyo", () => {
  test("administrador principal: sus comunidades, nunca las de otra administradora", async () => {
    const u = usuario({ rol: "ADMINISTRADOR", administradoraId: A, accesoTodas: true });
    const r = (await ejecutarHerramienta(u, "listar_comunidades", {})) as { comunidades: { id: string }[] };
    assert.deepEqual(new Set(r.comunidades.map((c) => c.id)), new Set([c1, c2]));
    const ajena = await ejecutarHerramienta(u, "cobranza_comunidad", { comunidad_id: c3 });
    assert.match(json(ajena), /No encontré esa comunidad/);
    const cuenta = await ejecutarHerramienta(u, "estado_cuenta_unidad", { comunidad_id: c1, unidad: "101" });
    assert.match(json(cuenta), /84\.000/);
  });

  test("administrador no principal: solo las comunidades asignadas", async () => {
    const u = usuario({ rol: "ADMINISTRADOR", administradoraId: A, asignados: [c1] });
    const r = (await ejecutarHerramienta(u, "listar_comunidades", {})) as { comunidades: { id: string }[] };
    assert.deepEqual(r.comunidades.map((c) => c.id), [c1]);
    assert.match(json(await ejecutarHerramienta(u, "cobranza_comunidad", { comunidad_id: c2 })), /No encontré esa comunidad/);
    assert.match(json(await ejecutarHerramienta(u, "estado_cuenta_unidad", { comunidad_id: c2, unidad: "201" })), /No encontré esa comunidad/);
  });

  test("comité: solo su comunidad", async () => {
    const u = usuario({ rol: "COMITE", administradoraId: A, condominioId: c1 });
    const morosidad = (await ejecutarHerramienta(u, "cobranza_comunidad", { comunidad_id: c1 })) as {
      unidades_con_deuda_vencida: { unidad: string }[];
    };
    assert.deepEqual(morosidad.unidades_con_deuda_vencida.map((m) => m.unidad), ["101"]);
    assert.match(json(await ejecutarHerramienta(u, "cobranza_comunidad", { comunidad_id: c2 })), /No encontré esa comunidad/);
  });

  test("residente: solo sus unidades y sin herramientas de administración", async () => {
    const u = usuario({ rol: "RESIDENTE", administradoraId: A, personaId });
    assert.deepEqual(herramientasPara(u).map((h) => h.definicion.name), ["mi_estado_de_cuenta", "novedades_comunidad"]);
    const r = (await ejecutarHerramienta(u, "mi_estado_de_cuenta", {})) as { unidades: { unidad: string; deuda_total: string }[] };
    assert.equal(r.unidades.length, 1);
    assert.match(r.unidades[0].unidad, /101/);
    assert.match(r.unidades[0].deuda_total, /84\.000/);
    assert.match(json(await ejecutarHerramienta(u, "cobranza_comunidad", { comunidad_id: c1 })), /no está disponible/);
  });

  test("no se envían RUT, correos ni teléfonos", async () => {
    const admin = usuario({ rol: "ADMINISTRADOR", administradoraId: A, accesoTodas: true });
    const res = usuario({ rol: "RESIDENTE", administradoraId: A, personaId });
    const todo = json([
      await ejecutarHerramienta(admin, "estado_cuenta_unidad", { comunidad_id: c1, unidad: "101" }),
      await ejecutarHerramienta(admin, "cobranza_comunidad", { comunidad_id: c1 }),
      await ejecutarHerramienta(res, "mi_estado_de_cuenta", {}),
    ]);
    for (const dato of ["11.111.111-1", "ficticia@ejemplo.cl", "+56900000000", "Residente Ficticia"]) {
      assert.ok(!todo.includes(dato), `no debe aparecer ${dato}`);
    }
  });

  test("la plataforma no tiene herramientas de datos", () => {
    assert.equal(herramientasPara(usuario({ rol: "SUPERADMIN" })).length, 0);
  });
});

describe("IA-002 · pregunta completa con el servicio de IA falso", () => {
  test("usa la herramienta, responde, anota tokens y respeta el límite diario", async () => {
    const u = usuario({ rol: "RESIDENTE", administradoraId: A, personaId });
    recibidas.length = 0;
    const r1 = await preguntarAlAsistente(u, { pregunta: "¿Cuánto debo?", historial: [], ruta: "/mi-cuenta" });
    assert.deepEqual(r1, { ok: true, texto: "Respuesta de prueba.", restantes: 1 });
    assert.equal(recibidas.length, 2, "una llamada pide la herramienta y otra responde");
    assert.deepEqual(recibidas[0].tools.map((t) => t.name), ["mi_estado_de_cuenta", "novedades_comunidad"]);
    const resultado = json(recibidas[1].messages.at(-1)!.content);
    assert.match(resultado, /84\.000/);
    assert.match(recibidas[0].system[1].text, /residente/);

    const anotada = await db.consultaAsistente.findFirst({ where: { usuarioId: u.id } });
    assert.equal(anotada?.exitosa, true);
    assert.equal(anotada?.tokensEntrada, 2000);
    assert.equal(anotada?.tokensCacheLectura, 4000);

    const r2 = await preguntarAlAsistente(u, { pregunta: "¿Y cuándo vence?", historial: [{ rol: "usuario", texto: "¿Cuánto debo?" }, { rol: "asistente", texto: "Respuesta de prueba." }], ruta: "/mi-cuenta" });
    assert.equal(r2.ok, true);
    const r3 = await preguntarAlAsistente(u, { pregunta: "Otra más", historial: [], ruta: "/mi-cuenta" });
    assert.deepEqual(r3, { ok: false, error: "Llegaste al límite de preguntas de hoy. Mañana puedes volver a preguntar." });
  });

  test("administrador en la página de una comunidad ajena: no se le da esa comunidad como contexto", async () => {
    const u = usuario({ rol: "ADMINISTRADOR", administradoraId: A, asignados: [c1] });
    recibidas.length = 0;
    await preguntarAlAsistente(u, { pregunta: "¿Cómo va esta comunidad?", historial: [], ruta: `/condominios/${c2}` });
    assert.ok(!recibidas[0].system[1].text.includes("Está viendo la comunidad"));
    await preguntarAlAsistente(u, { pregunta: "¿Cómo va esta comunidad?", historial: [], ruta: `/condominios/${c1}/morosidad` });
    assert.match(recibidas.at(-1)!.system[1].text, /Comunidad Uno/);
  });

  test("sin clave el asistente no está disponible", async () => {
    const clave = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const r = await preguntarAlAsistente(usuario({ rol: "ADMINISTRADOR", administradoraId: A, accesoTodas: true }), { pregunta: "hola", historial: [], ruta: "/" });
    process.env.ANTHROPIC_API_KEY = clave;
    assert.deepEqual(r, { ok: false, error: "El asistente no está disponible." });
  });
});
