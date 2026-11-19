// PILOTO-001: registro de cuentas con base de datos. Códigos de acceso, verificación de correo,
// solicitudes de vínculo y aislamiento entre administraciones. Solo datos ficticios.
// Necesitan una base de PRUEBA (nunca la real): npm run test:bd
import "dotenv/config";
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import type { UsuarioActual } from "../src/lib/auth";
import { puedeVerCondominio, puedeVerUnidad } from "../src/lib/acceso";
import {
  aprobarSolicitud,
  crearCodigoRegistro,
  crearSolicitud,
  nuevoEnlaceVerificacion,
  rechazarSolicitud,
  registrarAdministrador,
  registrarResidente,
  renovarCodigoComunidad,
} from "../src/lib/cuentas";
import { invitarPersona } from "../src/lib/invitaciones";
import { canjearToken, confirmarCorreo, crearToken, hashToken, tokenVigente } from "../src/lib/recuperacion";

if (/neon\.tech|vercel/i.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Estas pruebas crean y borran datos: no se ejecutan contra una base de Neon o Vercel.");
}
// Los enlaces se arman con esta dirección (sin pedir encabezados de una petición).
process.env.APP_URL = "http://prueba.local";

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const correo = (n: string) => `${n}-${sufijo}@prueba.test`;
const administradoras: string[] = [];
const usuarios: string[] = [];
const codigos: string[] = [];

after(async () => {
  await db.usuario.deleteMany({ where: { OR: [{ id: { in: usuarios } }, { correo: { endsWith: `${sufijo}@prueba.test` } }] } });
  await db.vinculoUnidad.deleteMany({ where: { administradoraId: { in: administradoras } } });
  await db.administradora.deleteMany({ where: { id: { in: administradoras } } });
  await db.codigoRegistro.deleteMany({ where: { id: { in: codigos } } });
  await db.$disconnect();
});

const plataforma = { id: "plataforma", nombre: "Plataforma de prueba", administradoraId: null } as unknown as UsuarioActual;

/** La cuenta como la arma getUsuarioActual (con sus comunidades asignadas). */
async function sesionDe(usuarioId: string): Promise<UsuarioActual> {
  const u = await db.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: { asignaciones: true, administradora: { select: { nombre: true, moneda: true } } },
  });
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    rol: u.rol,
    administradoraId: u.administradoraId,
    condominioId: u.condominioId,
    personaId: u.personaId,
    accesoTodas: u.accesoTodas,
    cargo: u.cargo,
    permisosExtra: u.permisosExtra,
    telefono: u.telefono,
    administradora: u.administradora,
    asignados: u.asignaciones.map((a) => a.condominioId),
  };
}

const tokenDe = (enlace: string) => enlace.split("/").pop()!;

async function nuevoCodigo(d: Partial<{ correo: string | null; usos: number; dias: number }> = {}) {
  const r = await crearCodigoRegistro(plataforma, { etiqueta: `Prueba ${sufijo}`, correo: null, usos: 1, dias: 7, ...d });
  const c = await db.codigoRegistro.findUniqueOrThrow({ where: { tokenHash: hashToken(r.codigo) } });
  codigos.push(c.id);
  return r.codigo;
}

/** Registra un administrador con código y confirma su correo. */
async function administrador(nombre: string) {
  const codigo = await nuevoCodigo();
  const r = await registrarAdministrador({ codigo, nombre, correo: correo(nombre), telefono: null, clave: "clave-segura-1", administracion: `Adm ${nombre}` });
  assert.equal(r.ok, true);
  const u = await db.usuario.findUniqueOrThrow({ where: { correo: correo(nombre) } });
  usuarios.push(u.id);
  administradoras.push(u.administradoraId!);
  assert.ok(await confirmarCorreo(tokenDe(await nuevoEnlaceVerificacion(u.id))));
  return sesionDe(u.id);
}

describe("registro de administradores con código de acceso", () => {
  test("sin código válido no se crea nada; con código, una administración nueva y vacía", async () => {
    const malo = await registrarAdministrador({
      codigo: "CV-AAAA-BBBB-CCCC",
      nombre: "Sin Codigo",
      correo: correo("sincodigo"),
      telefono: null,
      clave: "clave-segura-1",
      administracion: null,
    });
    assert.equal(malo.ok, false);
    assert.equal(await db.usuario.count({ where: { correo: correo("sincodigo") } }), 0);

    const codigo = await nuevoCodigo({ correo: correo("leyla") });
    const otro = await registrarAdministrador({ codigo, nombre: "Otra", correo: correo("otra"), telefono: null, clave: "clave-segura-1", administracion: null });
    assert.equal(otro.ok, false, "un código para un correo no sirve para otro");

    const r = await registrarAdministrador({ codigo, nombre: "Leyla Prueba", correo: correo("leyla"), telefono: "+56 9 1111 1111", clave: "clave-segura-1", administracion: "Adm Leyla" });
    assert.equal(r.ok, true);
    const u = await db.usuario.findUniqueOrThrow({ where: { correo: correo("leyla") }, include: { administradora: { include: { condominios: true } } } });
    usuarios.push(u.id);
    administradoras.push(u.administradoraId!);
    assert.equal(u.rol, "ADMINISTRADOR", "nunca SUPERADMIN");
    assert.equal(u.accesoTodas, true);
    assert.equal(u.correoVerificadoEn, null, "debe confirmar su correo antes de entrar");
    assert.equal(u.administradora!.condominios.length, 0, "parte sin comunidades");

    const repetido = await registrarAdministrador({ codigo, nombre: "Leyla 2", correo: correo("leyla2"), telefono: null, clave: "clave-segura-1", administracion: null });
    assert.equal(repetido.ok, false, "un código de un uso no sirve dos veces");
  });

  test("el enlace de confirmación sirve una vez; uno vencido no sirve", async () => {
    const codigo = await nuevoCodigo();
    await registrarAdministrador({ codigo, nombre: "Vence", correo: correo("vence"), telefono: null, clave: "clave-segura-1", administracion: null });
    const u = await db.usuario.findUniqueOrThrow({ where: { correo: correo("vence") } });
    usuarios.push(u.id);
    administradoras.push(u.administradoraId!);
    const token = tokenDe(await nuevoEnlaceVerificacion(u.id));
    await db.tokenRecuperacion.update({ where: { tokenHash: hashToken(token) }, data: { expiraEn: new Date(Date.now() - 1000) } });
    assert.equal(await confirmarCorreo(token), null, "vencido");
    const bueno = tokenDe(await nuevoEnlaceVerificacion(u.id));
    assert.ok(await confirmarCorreo(bueno));
    assert.equal(await confirmarCorreo(bueno), null, "ya usado");
    // Un enlace de confirmación no sirve para cambiar la contraseña.
    const otro = await crearToken(u.id, "VERIFICACION");
    assert.equal(await canjearToken(otro, "RECUPERACION", "otra-clave-123"), null);
    assert.equal(await tokenVigente(otro, "INVITACION"), null);
  });

  test("dos administradores no ven las comunidades del otro", async () => {
    const a = await administrador("adm-a");
    const b = await administrador("adm-b");
    const cA = await db.condominio.create({ data: { administradoraId: a.administradoraId!, nombre: "Comunidad A", direccion: "Calle A" } });
    const uA = await db.unidad.create({ data: { administradoraId: a.administradoraId!, condominioId: cA.id, numero: "101", alicuota: 100 } });
    assert.equal(await puedeVerCondominio(a, cA.id), true);
    assert.equal(await puedeVerCondominio(b, cA.id), false);
    assert.equal(await puedeVerUnidad(b, uA.id), false);
  });
});

describe("registro de residentes y solicitudes de vínculo", () => {
  test("registrarse no da acceso; la administración aprueba y une la cuenta con su ficha del Excel", async () => {
    const adm = await administrador("adm-res");
    const otraAdm = await administrador("adm-ajena");
    const comunidad = await db.condominio.create({
      data: { administradoraId: adm.administradoraId!, nombre: "Los Aromos (ficticia)", direccion: "Calle 1", estado: "HABILITADA_ADMINISTRATIVA" },
    });
    const [u302, u303] = await Promise.all(
      ["302", "303"].map((numero) => db.unidad.create({ data: { administradoraId: adm.administradoraId!, condominioId: comunidad.id, numero, alicuota: 50 } })),
    );
    // Ficha cargada desde Excel, con el mismo correo con que la persona se registrará.
    const ficha = await db.persona.create({ data: { administradoraId: adm.administradoraId!, nombre: "Ana Ficticia", correo: correo("ana").toUpperCase() } });
    const codigo = await renovarCodigoComunidad(comunidad.id);

    const r = await registrarResidente({
      nombre: "Ana Ficticia",
      correo: correo("ana"),
      telefono: null,
      clave: "clave-segura-1",
      solicitud: { condominioId: comunidad.id, administradoraId: adm.administradoraId!, unidadTexto: "Depto 302", relacion: "ARRENDATARIO", mensaje: null },
    });
    assert.equal(r.ok, true);
    const cuenta = await db.usuario.findUniqueOrThrow({ where: { correo: correo("ana") } });
    usuarios.push(cuenta.id);
    assert.equal(cuenta.rol, "RESIDENTE");
    assert.equal(cuenta.personaId, null);
    assert.equal(cuenta.administradoraId, null);
    const ana = await sesionDe(cuenta.id);
    assert.equal(await puedeVerUnidad(ana, u302.id), false, "conocer el número de la unidad no da acceso");
    assert.equal(await puedeVerCondominio(ana, comunidad.id), false);

    const solicitud = await db.solicitudVinculo.findFirstOrThrow({ where: { usuarioId: cuenta.id } });
    const decision = { unidadId: u302.id, personaId: ficha.id, relacion: "ARRENDATARIO" as const };
    assert.match((await aprobarSolicitud(adm, solicitud.id, decision)) ?? "", /confirma su correo/, "sin correo confirmado no se aprueba");
    assert.ok(await confirmarCorreo(tokenDe(await nuevoEnlaceVerificacion(cuenta.id))));

    assert.equal(await aprobarSolicitud(otraAdm, solicitud.id, decision), "Solicitud no encontrada.", "otra administración no la ve");
    assert.match((await aprobarSolicitud(adm, solicitud.id, { ...decision, personaId: "NUEVA" })) ?? "", /Ya existe la ficha/, "no duplica a la persona");
    assert.equal(await aprobarSolicitud(adm, solicitud.id, decision), null);
    assert.equal(await aprobarSolicitud(adm, solicitud.id, decision), "Esta solicitud ya fue revisada.");

    const unida = await sesionDe(cuenta.id);
    assert.equal(unida.personaId, ficha.id);
    assert.equal(await puedeVerUnidad(unida, u302.id), true);
    assert.equal(await puedeVerUnidad(unida, u303.id), false, "solo su unidad");
    const vinculos = await db.vinculoUnidad.findMany({ where: { personaId: ficha.id } });
    assert.deepEqual(vinculos.map((v) => v.tipo), ["ARRENDATARIO"]);
    assert.equal(await db.persona.count({ where: { administradoraId: adm.administradoraId! } }), 1, "sin personas duplicadas");

    // Con su cuenta ya en esta administración, no puede pedir unirse a una comunidad de otra.
    const ajena = await db.condominio.create({ data: { administradoraId: otraAdm.administradoraId!, nombre: "Ajena", direccion: "X", estado: "HABILITADA_ADMINISTRATIVA" } });
    const codigoAjeno = await renovarCodigoComunidad(ajena.id);
    const intento = await crearSolicitud(unida, { codigo: codigoAjeno, unidadTexto: "1", relacion: "PROPIETARIO_RESIDENTE", mensaje: null });
    assert.equal(intento.ok, false);

    // Una segunda solicitud en su comunidad sí; rechazarla queda con motivo.
    const segunda = await crearSolicitud(unida, { codigo, unidadTexto: "303", relacion: "PROPIETARIO_RESIDENTE", mensaje: null });
    assert.equal(segunda.ok, true);
    const repetida = await crearSolicitud(unida, { codigo, unidadTexto: "303", relacion: "PROPIETARIO_RESIDENTE", mensaje: null });
    assert.equal(repetida.ok, false, "una sola pendiente por comunidad");
    const s2 = await db.solicitudVinculo.findFirstOrThrow({ where: { usuarioId: cuenta.id, estado: "PENDIENTE" } });
    assert.equal(await rechazarSolicitud(adm, s2.id, "No figura en la escritura"), null);
    assert.equal(await puedeVerUnidad(await sesionDe(cuenta.id), u303.id), false);
  });

  test("propietario no residente y arrendatario: cuentas distintas en la misma unidad, con su relación", async () => {
    const adm = await administrador("adm-rel");
    const comunidad = await db.condominio.create({
      data: { administradoraId: adm.administradoraId!, nombre: "Rel", direccion: "Calle 1", estado: "HABILITADA_ADMINISTRATIVA" },
    });
    const unidad = await db.unidad.create({ data: { administradoraId: adm.administradoraId!, condominioId: comunidad.id, numero: "10", alicuota: 100 } });
    const ids: Record<string, string> = {};
    for (const [n, relacion] of [["dueno", "PROPIETARIO_NO_RESIDENTE"], ["arrienda", "ARRENDATARIO"]] as const) {
      await registrarResidente({
        nombre: `Persona ${n}`,
        correo: correo(n),
        telefono: null,
        clave: "clave-segura-1",
        solicitud: { condominioId: comunidad.id, administradoraId: adm.administradoraId!, unidadTexto: "10", relacion, mensaje: null },
      });
      const u = await db.usuario.findUniqueOrThrow({ where: { correo: correo(n) } });
      usuarios.push(u.id);
      await confirmarCorreo(tokenDe(await nuevoEnlaceVerificacion(u.id)));
      const s = await db.solicitudVinculo.findFirstOrThrow({ where: { usuarioId: u.id } });
      assert.equal(await aprobarSolicitud(adm, s.id, { unidadId: unidad.id, personaId: "NUEVA", relacion }), null);
      ids[n] = (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).personaId!;
    }
    const relaciones = await db.unidadPersona.findMany({ where: { unidadId: unidad.id } });
    const de = (p: string) => relaciones.filter((r) => r.personaId === p).map((r) => r.relacion);
    assert.deepEqual(de(ids.dueno), ["PROPIETARIO"], "el dueño vota y recibe los cobros");
    assert.deepEqual(de(ids.arrienda), ["RESIDENTE"], "el arrendatario no es dueño");
  });

  test("invitar a una persona que ya creó su cuenta sin confirmar: se une a su ficha y la contraseña anterior deja de servir", async () => {
    const adm = await administrador("adm-inv");
    const comunidad = await db.condominio.create({
      data: { administradoraId: adm.administradoraId!, nombre: "Inv", direccion: "Calle 1", estado: "HABILITADA_ADMINISTRATIVA" },
    });
    const unidad = await db.unidad.create({ data: { administradoraId: adm.administradoraId!, condominioId: comunidad.id, numero: "5", alicuota: 100 } });
    const persona = await db.persona.create({ data: { administradoraId: adm.administradoraId!, nombre: "Beto Ficticio", correo: correo("beto") } });
    await db.unidadPersona.create({ data: { unidadId: unidad.id, personaId: persona.id, relacion: "PROPIETARIO" } });
    // Alguien creó una cuenta con el correo de Beto, pero nunca lo confirmó.
    await registrarResidente({ nombre: "Impostor", correo: correo("beto"), telefono: null, clave: "clave-del-impostor", solicitud: null });
    const antes = await db.usuario.findUniqueOrThrow({ where: { correo: correo("beto") } });
    usuarios.push(antes.id);

    const r = await invitarPersona(adm, adm.administradoraId!, persona.id, comunidad.id);
    assert.equal(r.ok, true);
    const despues = await db.usuario.findUniqueOrThrow({ where: { id: antes.id } });
    assert.equal(despues.personaId, persona.id, "sin crear otra cuenta");
    assert.notEqual(despues.claveHash, antes.claveHash, "la contraseña del impostor ya no sirve");
    assert.equal(despues.correoVerificadoEn, null, "solo la invitación (que llega al correo) la activa");
    assert.equal(await db.tokenRecuperacion.count({ where: { usuarioId: antes.id, tipo: "VERIFICACION", usadoEn: null } }), 0);
  });
});
