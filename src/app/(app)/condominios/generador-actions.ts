"use server";

// COM-001-VIS · Acciones del generador visual. Todo lo que crea usa las tablas de siempre
// (Agrupacion, Unidad, Espacio, Instalacion): no hay un sistema paralelo de unidades.

import { revalidatePath } from "next/cache";
import { crearDentroDelCupo, SinCupoError } from "@/lib/planes-servicio";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { registrar } from "@/lib/registro";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import {
  alicuotaProvisional,
  comparar,
  normalizar,
  planificar,
  respuestasIniciales,
  TIPOS_GENERADOR,
  type Registros,
  type TipoGenerador,
} from "@/lib/generador";
import { existentesDe, registrosDe } from "@/lib/generador-servicio";
import type { Prisma } from "@/generated/prisma/client";

export type ResultadoGenerador = { ok: boolean; mensaje: string };

class ErrorUsuario extends Error {}

/** Solo administradores asignados a esa comunidad (el comité solo mira). */
async function acceso(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, condominioId)) return null;
  const condominio = await db.condominio.findFirst({
    where: { id: condominioId, administradoraId },
    select: { id: true, nombre: true, estado: true, tipo: true, totalUnidades: true },
  });
  return condominio ? { usuario, administradoraId, condominio } : null;
}

const NuevaSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }).max(120),
  direccion: z.string({ error: "Ingresa la dirección." }).min(3, { error: "Ingresa la dirección." }).max(200),
  comuna: z.string().max(80).optional(),
  tipo: z.enum(Object.keys(TIPOS_GENERADOR) as [TipoGenerador, ...TipoGenerador[]], { error: "Elige cómo está compuesta la comunidad." }),
  modalidad: z.enum(["NUEVA", "EXISTENTE"]).optional(),
});

/** «Nueva comunidad» con el asistente: crea la comunidad (en configuración) y abre el generador. */
export async function crearComunidadVisual(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora("propiedades.crear");
  const datos = NuevaSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    direccion: aTexto(formData.get("direccion")),
    comuna: aTexto(formData.get("comuna")),
    tipo: aTexto(formData.get("tipo")),
    modalidad: aTexto(formData.get("modalidad")),
  });
  if (!datos.success) {
    return { ...erroresDe(datos.error), valores: Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])) };
  }
  const { tipo, modalidad, ...resto } = datos.data;
  // SUS-001: solo dentro del cupo del plan que asignó la plataforma.
  let condominio;
  try {
    condominio = await crearDentroDelCupo(administradoraId, (tx) =>
      tx.condominio.create({
    data: {
      ...resto,
      comuna: resto.comuna ?? null,
      administradoraId,
      tipo: TIPOS_GENERADOR[tipo].tipoComunidad,
      modalidad: modalidad ?? null,
      plano: { create: { administradoraId, respuestas: { ...respuestasIniciales(tipo), paso: 1 } as Prisma.InputJsonValue } },
    },
      }),
    );
  } catch (e) {
    if (e instanceof SinCupoError) {
      return { mensaje: e.message, valores: Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)])) };
    }
    throw e;
  }
  await registrar(usuario, "Creó una propiedad", `${condominio.nombre} (en configuración, con el generador visual)`, condominio.id);
  redirect(`/condominios/${condominio.id}/generador?creada=1`);
}

/** Guarda el avance del asistente (no crea unidades). */
export async function guardarBorrador(condominioId: string, respuestas: unknown): Promise<ResultadoGenerador> {
  const a = await acceso(condominioId);
  if (!a) return { ok: false, mensaje: "Propiedad no encontrada." };
  const r = normalizar(respuestas);
  const json = r as unknown as Prisma.InputJsonValue;
  if (JSON.stringify(json).length > 400_000) return { ok: false, mensaje: "Demasiadas correcciones a mano para guardar." };
  await db.planoComunidad.upsert({
    where: { condominioId },
    create: { condominioId, administradoraId: a.administradoraId, respuestas: json },
    update: { respuestas: json },
  });
  return { ok: true, mensaje: "Avance guardado." };
}

type Posicion = { x: number; y: number };
const PosicionSchema = z.object({ x: z.number().finite().min(-5000).max(20000), y: z.number().finite().min(-5000).max(50000) });

/**
 * Crea (o ajusta) los registros del plan. Se puede repetir sin duplicar: lo que ya existe se
 * reconoce por su id permanente o por su número. Nunca borra: lo que sobra se conserva.
 */
export async function generar(condominioId: string, respuestas: unknown, posiciones: Record<string, Posicion> = {}): Promise<ResultadoGenerador> {
  const a = await acceso(condominioId);
  if (!a) return { ok: false, mensaje: "Propiedad no encontrada." };
  const { administradoraId, condominio, usuario } = a;
  const r = normalizar(respuestas);
  if (!r.tipo) return { ok: false, mensaje: "Elige primero cómo está compuesta la comunidad." };
  const plan = planificar(r);

  try {
    const resumen = await db.$transaction(
      async (tx) => {
        const plano = await tx.planoComunidad.findUnique({ where: { condominioId } });
        const registrosPrevios = registrosDe(plano?.registros);
        const ex = await existentesDe(condominioId, tx);
        const comp = comparar(plan, ex, registrosPrevios);
        if (comp.errores.length) throw new ErrorUsuario(comp.errores.join(" "));
        if (comp.crear.unidades.length && condominio.estado === "HABILITADA_FINANCIERA") {
          throw new ErrorUsuario(
            "Esta comunidad ya emite cobros: las unidades nuevas se agregan desde Unidades, con su alícuota. El generador solo puede ubicar y ordenar las que ya existen.",
          );
        }
        const ids: Registros = { ...comp.ids };

        // 1) Torres, sectores, pisos y subterráneos (los padres van antes que sus hijos).
        for (const g of comp.crear.agrupaciones) {
          const creada = await tx.agrupacion.create({
            data: { administradoraId, condominioId, tipo: g.tipo, nombre: g.nombre, padreId: g.padre ? ids[g.padre] : null, orden: g.orden },
          });
          ids[g.clave] = creada.id;
        }

        // 2) Cambios de número o nombre: el registro es el mismo, conserva su historial.
        //    Primero a un nombre temporal para que dos unidades puedan intercambiar números.
        const ren = comp.renumerar;
        for (const x of ren.filter((x) => x.tipo === "UNIDAD")) await tx.unidad.update({ where: { id: x.id }, data: { numero: `~${x.id}` } });
        for (const x of ren.filter((x) => x.tipo === "ESPACIO")) await tx.espacio.update({ where: { id: x.id }, data: { codigo: `~${x.id}` } });
        for (const x of ren) {
          if (x.tipo === "UNIDAD") await tx.unidad.update({ where: { id: x.id }, data: { numero: x.a } });
          if (x.tipo === "ESPACIO") await tx.espacio.update({ where: { id: x.id }, data: { codigo: x.a } });
          if (x.tipo === "INSTALACION") await tx.instalacion.update({ where: { id: x.id }, data: { nombre: x.a } });
          if (x.tipo === "AGRUPACION") await tx.agrupacion.update({ where: { id: x.id }, data: { nombre: x.a } });
        }

        // 3) Unidades nuevas, con alícuota provisional igual (se corrige en Unidades o con Excel).
        const alicuota = alicuotaProvisional(plan.unidades.length);
        if (comp.crear.unidades.length) {
          const creadas = await tx.unidad.createManyAndReturn({
            data: comp.crear.unidades.map((u) => ({
              administradoraId,
              condominioId,
              numero: u.numero,
              tipo: u.tipo,
              alicuota,
              agrupacionId: u.agrupacion ? ids[u.agrupacion] : null,
            })),
            select: { id: true, numero: true },
          });
          const porNumero = new Map(creadas.map((u) => [u.numero.toLowerCase(), u.id]));
          for (const u of comp.crear.unidades) {
            const id = porNumero.get(u.numero.toLowerCase());
            if (id) ids[u.clave] = id;
          }
        }
        // Unidades que ya existían sin torre, piso ni sector: se ubican donde dice el plan.
        for (const u of comp.ubicar) {
          const agr = ids[u.agrupacion];
          if (agr) await tx.unidad.updateMany({ where: { id: u.id, condominioId, agrupacionId: null }, data: { agrupacionId: agr } });
        }

        // 4) Estacionamientos y bodegas: condición jurídica "por definir" (no se presume propiedad ni asignación).
        if (comp.crear.espacios.length) {
          const creados = await tx.espacio.createManyAndReturn({
            data: comp.crear.espacios.map((e) => ({
              administradoraId,
              condominioId,
              clase: e.clase,
              codigo: e.codigo,
              regimen: "POR_DEFINIR" as const,
              destino: e.destino,
              accesible: e.accesible,
              observaciones: e.nota ?? null,
            })),
            select: { id: true, clase: true, codigo: true },
          });
          const porCodigo = new Map(creados.map((e) => [`${e.clase}:${e.codigo.toLowerCase()}`, e.id]));
          for (const e of comp.crear.espacios) {
            const id = porCodigo.get(`${e.clase}:${e.codigo.toLowerCase()}`);
            if (id) ids[e.clave] = id;
          }
        }

        // 5) Accesos, espacios comunes e instalaciones (sus antecedentes técnicos se completan después).
        if (comp.crear.instalaciones.length) {
          const creadas = await tx.instalacion.createManyAndReturn({
            data: comp.crear.instalaciones.map((i) => ({
              administradoraId,
              condominioId,
              tipo: i.tipo,
              codigo: i.codigo,
              nombre: i.nombre,
              ubicacion: i.ubicacion ?? null,
            })),
            select: { id: true, codigo: true },
          });
          const porCodigo = new Map(creadas.map((i) => [i.codigo.toLowerCase(), i.id]));
          for (const i of comp.crear.instalaciones) {
            const id = porCodigo.get(i.codigo.toLowerCase());
            if (id) ids[i.clave] = id;
          }
        }

        // 6) Ubicaciones dibujadas antes de crear: pasan a los registros recién creados.
        const tipoDe = new Map<string, "AGRUPACION" | "UNIDAD" | "ESPACIO" | "INSTALACION">([
          ...plan.agrupaciones.map((x) => [x.clave, "AGRUPACION"] as const),
          ...plan.unidades.map((x) => [x.clave, "UNIDAD"] as const),
          ...plan.espacios.map((x) => [x.clave, "ESPACIO"] as const),
          ...plan.instalaciones.map((x) => [x.clave, "INSTALACION"] as const),
        ]);
        const nuevasPos = Object.entries(posiciones)
          .slice(0, 5000)
          .flatMap(([clave, p]) => {
            const ok = PosicionSchema.safeParse(p);
            const tipo = tipoDe.get(clave);
            return ok.success && tipo && ids[clave] ? [{ administradoraId, condominioId, tipo, registroId: ids[clave], x: ok.data.x, y: ok.data.y }] : [];
          });
        if (nuevasPos.length) await tx.elementoPlano.createMany({ data: nuevasPos, skipDuplicates: true });

        const json = r as unknown as Prisma.InputJsonValue;
        const registros = { ...registrosPrevios, ...ids } as Prisma.InputJsonValue;
        await tx.planoComunidad.upsert({
          where: { condominioId },
          create: { condominioId, administradoraId, respuestas: json, registros, generadoEn: new Date() },
          update: { respuestas: json, registros, generadoEn: new Date() },
        });
        await tx.condominio.update({
          where: { id: condominioId },
          data: {
            tipo: condominio.tipo ?? TIPOS_GENERADOR[r.tipo!].tipoComunidad,
            totalUnidades: condominio.totalUnidades ?? (plan.unidades.length || null),
          },
        });
        return {
          agrupaciones: comp.crear.agrupaciones.length,
          unidades: comp.crear.unidades.length,
          espacios: comp.crear.espacios.length,
          instalaciones: comp.crear.instalaciones.length,
          renumeradas: ren.length,
          ubicadas: comp.ubicar.length,
          reutilizadas: comp.reutilizar.unidades,
        };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    const partes = [
      resumen.unidades && `${resumen.unidades} unidades`,
      resumen.agrupaciones && `${resumen.agrupaciones} torres, sectores o pisos`,
      resumen.espacios && `${resumen.espacios} estacionamientos o bodegas`,
      resumen.instalaciones && `${resumen.instalaciones} accesos o instalaciones`,
    ].filter(Boolean);
    const cambios = [
      partes.length ? `Creó ${partes.join(", ")}` : "",
      resumen.renumeradas ? `cambió el número o nombre de ${resumen.renumeradas} registros (conservan su historial)` : "",
      resumen.ubicadas ? `ubicó ${resumen.ubicadas} unidades existentes en su torre, piso o sector` : "",
    ].filter(Boolean);
    const mensaje = cambios.length ? `${cambios.join("; ")}.` : "No había nada nuevo que crear: todo ya existía.";
    await registrar(usuario, "Usó el generador visual", `${condominio.nombre}: ${mensaje}`, condominioId);
    revalidatePath(`/condominios/${condominioId}`, "layout");
    return { ok: true, mensaje };
  } catch (e) {
    if (e instanceof ErrorUsuario) return { ok: false, mensaje: e.message };
    // Dos personas generando a la vez: la base rechaza números repetidos y no se crea nada.
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, mensaje: "Alguien cambió la comunidad al mismo tiempo y no se creó nada. Recarga la página y revisa de nuevo." };
    }
    console.error(e);
    return { ok: false, mensaje: "No se pudo completar. No se creó nada; inténtalo de nuevo." };
  }
}

const ItemPosicion = z.object({
  tipo: z.enum(["AGRUPACION", "UNIDAD", "ESPACIO", "INSTALACION"]),
  registroId: z.string().min(1).max(40),
  x: PosicionSchema.shape.x,
  y: PosicionSchema.shape.y,
});

/** Guarda dónde quedó cada elemento en el plano. Solo es dibujo: no cambia datos de la unidad. */
export async function guardarPosiciones(condominioId: string, items: unknown): Promise<ResultadoGenerador> {
  const a = await acceso(condominioId);
  if (!a) return { ok: false, mensaje: "Propiedad no encontrada." };
  const datos = z.array(ItemPosicion).max(5000).safeParse(items);
  if (!datos.success) return { ok: false, mensaje: "Posiciones no válidas." };
  const lista = datos.data;
  if (!lista.length) return { ok: true, mensaje: "Nada que guardar." };
  // Cada id tiene que ser de esta comunidad.
  const deTipo = (t: string) => [...new Set(lista.filter((i) => i.tipo === t).map((i) => i.registroId))];
  const [ag, un, es, ins] = await Promise.all([
    db.agrupacion.count({ where: { condominioId, id: { in: deTipo("AGRUPACION") } } }),
    db.unidad.count({ where: { condominioId, id: { in: deTipo("UNIDAD") } } }),
    db.espacio.count({ where: { condominioId, id: { in: deTipo("ESPACIO") } } }),
    db.instalacion.count({ where: { condominioId, id: { in: deTipo("INSTALACION") } } }),
  ]);
  if (ag !== deTipo("AGRUPACION").length || un !== deTipo("UNIDAD").length || es !== deTipo("ESPACIO").length || ins !== deTipo("INSTALACION").length) {
    return { ok: false, mensaje: "Algún elemento ya no existe. Recarga la página." };
  }
  await db.$transaction([
    db.elementoPlano.deleteMany({ where: { condominioId, OR: lista.map((i) => ({ tipo: i.tipo, registroId: i.registroId })) } }),
    db.elementoPlano.createMany({ data: lista.map((i) => ({ ...i, condominioId, administradoraId: a.administradoraId })) }),
  ]);
  return { ok: true, mensaje: "Ubicación guardada." };
}

/** Vuelve a la distribución automática (borra solo las ubicaciones del dibujo). */
export async function ordenarAutomaticamente(condominioId: string): Promise<ResultadoGenerador> {
  const a = await acceso(condominioId);
  if (!a) return { ok: false, mensaje: "Propiedad no encontrada." };
  await db.elementoPlano.deleteMany({ where: { condominioId } });
  return { ok: true, mensaje: "El plano volvió a la distribución automática." };
}
