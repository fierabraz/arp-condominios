import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { puede, condominiosPermitidos } from "@/lib/permisos";
import { estadoCuenta, morosidad } from "@/lib/cobro-servicio";
import { resumenPropiedades } from "@/lib/resumen-propiedades";
import { nombrePeriodo } from "@/lib/cobro";
import { ETIQUETAS_MEDIO_PAGO, ETIQUETAS_TIPO_UNIDAD, formatoFecha, formatoFechaLarga, formatoMoneda } from "@/lib/formato";
import { unidadesDelResidente } from "@/app/(residente)/datos-residente";

// IA-002 · Herramientas del asistente: consultas de SOLO LECTURA sobre lo que la cuenta ya puede ver.
// Cada consulta revisa el permiso en el servidor con la sesión de la persona (no con lo que diga
// la IA). No se envían nombres, RUT, correos ni teléfonos: las unidades se nombran por su número.

type Herramienta = {
  definicion: Anthropic.Beta.Messages.BetaTool;
  ejecutar: (usuario: UsuarioActual, entrada: Record<string, unknown>) => Promise<unknown>;
};

const sinParametros = { type: "object" as const, properties: {}, additionalProperties: false, required: [] as string[] };

const dinero = (usuario: UsuarioActual) => (n: number | string | { toString(): string }) =>
  formatoMoneda(n, usuario.administradora?.moneda ?? "CLP");

/** Comunidad de la administradora que la cuenta puede ver, o null. */
async function comunidadVisible(usuario: UsuarioActual, id: unknown) {
  if (typeof id !== "string" || !id || !usuario.administradoraId) return null;
  if (!puede(usuario, "propiedad.ver", id)) return null;
  return db.condominio.findFirst({
    where: { id, administradoraId: usuario.administradoraId },
    select: { id: true, nombre: true },
  });
}

const SIN_ACCESO = { error: "No encontré esa comunidad entre las que puedes ver." };

/** Resumen de la cuenta de una unidad, en el formato que se entrega a la IA. */
async function cuentaDeUnidad(usuario: UsuarioActual, unidadId: string) {
  const $ = dinero(usuario);
  const estado = await estadoCuenta(unidadId, usuario.administradoraId!);
  if (!estado) return null;
  const ahora = new Date();
  return {
    deuda_total: $(estado.deuda),
    deuda_vencida: $(estado.vencida),
    saldo_a_favor: $(estado.aFavor),
    // Transferencias informadas que la administración aún no verifica: NO descuentan deuda.
    transferencias_en_verificacion: { cantidad: estado.enVerificacion.cantidad, monto: $(estado.enVerificacion.monto) },
    avisos_recientes: estado.avisos.slice(0, 6).map((a) => ({
      mes: nombrePeriodo(a.periodo.anio, a.periodo.mes),
      total: $(a.total.toString()),
      saldo_por_pagar: $(a.saldo.toString()),
      vence: formatoFechaLarga(a.vencimiento),
      situacion: Number(a.saldo) <= 0 ? "pagado" : a.vencimiento < ahora ? "vencido" : "por vencer",
    })),
    pagos_recientes: estado.pagos.slice(0, 5).map((p) => ({
      fecha: formatoFecha(p.fecha),
      monto: $(p.monto.toString()),
      medio: ETIQUETAS_MEDIO_PAGO[p.medio],
      ...(p.anuladoEn ? { anulado: true } : {}),
    })),
  };
}

// ── Administración y comité ────────────────────────────────────────────────

const listarComunidades: Herramienta = {
  definicion: {
    name: "listar_comunidades",
    description:
      "Lista las comunidades que esta persona puede ver, con su id, unidades, último mes cerrado, porcentaje recaudado de ese mes y porcentaje de unidades con deuda vencida. Úsala para saber el id de una comunidad antes de usar las otras herramientas.",
    input_schema: sinParametros,
  },
  async ejecutar(usuario) {
    if (!usuario.administradoraId || !puede(usuario, "propiedad.ver")) return { comunidades: [] };
    const ids = condominiosPermitidos(usuario);
    const resumen = await resumenPropiedades(usuario.administradoraId, ids ?? undefined);
    return {
      comunidades: resumen.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        unidades_registradas: c.unidades,
        estado: c.estado,
        ultimo_mes_cerrado: c.ultimoPeriodo ? nombrePeriodo(c.ultimoPeriodo.anio, c.ultimoPeriodo.mes) : null,
        recaudado_ultimo_mes: c.recaudacion === null ? null : `${Math.round(c.recaudacion)} %`,
        unidades_con_deuda_vencida: `${Math.round(c.morosidad)} %`,
      })),
    };
  },
};

const cobranzaComunidad: Herramienta = {
  definicion: {
    name: "cobranza_comunidad",
    description:
      "Cobranza de una comunidad: los últimos meses (abiertos o cerrados) con gastos, total emitido y saldo por cobrar, y las unidades con deuda vencida ordenadas de mayor a menor. Las unidades se identifican solo por su número.",
    input_schema: {
      type: "object",
      properties: { comunidad_id: { type: "string", description: "Id de la comunidad (de listar_comunidades)." } },
      required: ["comunidad_id"],
      additionalProperties: false,
    },
  },
  async ejecutar(usuario, entrada) {
    const comunidad = await comunidadVisible(usuario, entrada.comunidad_id);
    if (!comunidad) return SIN_ACCESO;
    const $ = dinero(usuario);
    const [periodos, morosas] = await Promise.all([
      db.periodo.findMany({
        where: { condominioId: comunidad.id },
        orderBy: [{ anio: "desc" }, { mes: "desc" }],
        take: 6,
        include: { gastos: { select: { monto: true } }, avisos: { select: { total: true, saldo: true } } },
      }),
      morosidad(comunidad.id, usuario.administradoraId!),
    ]);
    const suma = (xs: { toString(): string }[]) => xs.reduce<number>((s, x) => s + Number(x.toString()), 0);
    return {
      comunidad: comunidad.nombre,
      meses: periodos.map((p) => ({
        mes: nombrePeriodo(p.anio, p.mes),
        estado: p.estado === "ABIERTO" ? "abierto (aún no se emiten cobros)" : "cerrado (cobros emitidos)",
        gastos_cargados: $(suma(p.gastos.map((g) => g.monto))),
        total_emitido: $(suma(p.avisos.map((a) => a.total))),
        saldo_por_cobrar: $(suma(p.avisos.map((a) => a.saldo))),
      })),
      unidades_con_deuda_vencida: morosas.slice(0, 30).map((m) => ({
        unidad: m.numero,
        deuda_vencida: $(m.deuda),
        avisos_impagos: m.avisos,
        vencida_desde: formatoFechaLarga(m.desde),
      })),
      total_unidades_morosas: morosas.length,
    };
  },
};

const estadoCuentaUnidad: Herramienta = {
  definicion: {
    name: "estado_cuenta_unidad",
    description:
      "Estado de cuenta de una unidad de una comunidad: deuda total y vencida, saldo a favor, últimos avisos de cobro y últimos pagos.",
    input_schema: {
      type: "object",
      properties: {
        comunidad_id: { type: "string", description: "Id de la comunidad (de listar_comunidades)." },
        unidad: { type: "string", description: "Número de la unidad tal como aparece en Convive, por ejemplo 302 o A-101." },
      },
      required: ["comunidad_id", "unidad"],
      additionalProperties: false,
    },
  },
  async ejecutar(usuario, entrada) {
    const comunidad = await comunidadVisible(usuario, entrada.comunidad_id);
    if (!comunidad) return SIN_ACCESO;
    const numero = typeof entrada.unidad === "string" ? entrada.unidad.trim() : "";
    if (!numero) return { error: "Falta el número de la unidad." };
    const unidades = await db.unidad.findMany({
      where: { condominioId: comunidad.id, numero: { equals: numero, mode: "insensitive" } },
      select: { id: true, numero: true, tipo: true },
      take: 5,
    });
    if (unidades.length === 0) return { error: `No hay una unidad ${numero} en ${comunidad.nombre}.` };
    return {
      comunidad: comunidad.nombre,
      unidades: await Promise.all(
        unidades.map(async (u) => ({ unidad: `${ETIQUETAS_TIPO_UNIDAD[u.tipo]} ${u.numero}`, ...(await cuentaDeUnidad(usuario, u.id)) })),
      ),
    };
  },
};

// ── Residentes ─────────────────────────────────────────────────────────────

const miEstadoDeCuenta: Herramienta = {
  definicion: {
    name: "mi_estado_de_cuenta",
    description:
      "Estado de cuenta de las unidades de esta persona: cuánto debe, cuánto está vencido, próximos vencimientos, últimos avisos de cobro y últimos pagos registrados.",
    input_schema: sinParametros,
  },
  async ejecutar(usuario) {
    if (!puede(usuario, "portal.residente") || !usuario.administradoraId) return { unidades: [] };
    const unidades = await unidadesDelResidente(usuario.personaId);
    return {
      unidades: await Promise.all(
        unidades.map(async (u) => ({
          comunidad: u.condominioNombre,
          unidad: u.nombre,
          ...(await cuentaDeUnidad(usuario, u.id)),
        })),
      ),
    };
  },
};

const novedadesComunidad: Herramienta = {
  definicion: {
    name: "novedades_comunidad",
    description:
      "Novedades de las comunidades de esta persona: últimas publicaciones de la administración y votaciones abiertas con su fecha de cierre.",
    input_schema: sinParametros,
  },
  async ejecutar(usuario) {
    if (!puede(usuario, "portal.residente")) return { publicaciones: [], votaciones_abiertas: [] };
    const ids = [...new Set((await unidadesDelResidente(usuario.personaId)).map((u) => u.condominioId))];
    const ahora = new Date();
    const [publicaciones, votaciones] = await Promise.all([
      db.publicacion.findMany({
        where: { condominioId: { in: ids } },
        orderBy: { creadoEn: "desc" },
        take: 5,
        select: { titulo: true, creadoEn: true, condominio: { select: { nombre: true } } },
      }),
      db.votacion.findMany({
        where: { condominioId: { in: ids }, estado: "ABIERTA", cierraEn: { gt: ahora } },
        orderBy: { cierraEn: "asc" },
        take: 5,
        select: { titulo: true, cierraEn: true, condominio: { select: { nombre: true } } },
      }),
    ]);
    return {
      publicaciones: publicaciones.map((p) => ({ titulo: p.titulo, fecha: formatoFechaLarga(p.creadoEn), comunidad: p.condominio.nombre })),
      votaciones_abiertas: votaciones.map((v) => ({ titulo: v.titulo, cierra: formatoFechaLarga(v.cierraEn), comunidad: v.condominio.nombre })),
    };
  },
};

/** Herramientas según el perfil. La plataforma no tiene ninguna (no ve datos de comunidades). */
export function herramientasPara(usuario: UsuarioActual): Herramienta[] {
  if (puede(usuario, "portal.residente")) return [miEstadoDeCuenta, novedadesComunidad];
  if (puede(usuario, "propiedad.ver")) return [listarComunidades, cobranzaComunidad, estadoCuentaUnidad];
  return [];
}

/** Ejecuta una herramienta pedida por la IA. Un nombre desconocido o un error se devuelven como texto. */
export async function ejecutarHerramienta(usuario: UsuarioActual, nombre: string, entrada: unknown) {
  const h = herramientasPara(usuario).find((x) => x.definicion.name === nombre);
  if (!h) return { error: `La herramienta ${nombre} no está disponible para esta cuenta.` };
  const datos = entrada && typeof entrada === "object" ? (entrada as Record<string, unknown>) : {};
  return h.ejecutar(usuario, datos);
}

/** Si la persona está mirando una comunidad que puede ver, su id y nombre (para entender "esta comunidad"). */
export async function comunidadDeLaPagina(usuario: UsuarioActual, ruta: unknown) {
  if (typeof ruta !== "string") return null;
  const m = /^\/condominios\/([^/?#]+)/.exec(ruta);
  if (!m || m[1] === "nuevo") return null;
  return comunidadVisible(usuario, m[1]);
}
