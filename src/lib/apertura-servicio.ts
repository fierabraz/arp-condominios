import "server-only";
// COM-001 · Entrega 5: junta los datos de una apertura para mostrarla y revisarla.

import { db } from "@/lib/db";
import { resumenApertura, revisarApertura, type DatosApertura } from "@/lib/apertura";
import { requisitosActivacion, requisitosPara } from "@/lib/configuracion";
import { datosDeUna } from "@/lib/configuracion-servicio";
import { CLASES, DESTINOS, REGIMENES } from "@/lib/estructura";
import type { DatosInforme } from "@/lib/informe-apertura";

export async function datosApertura(aperturaId: string) {
  const a = await db.apertura.findUniqueOrThrow({
    where: { id: aperturaId },
    include: {
      deudas: { include: { unidad: { select: { numero: true } } } },
      creditos: { include: { unidad: { select: { numero: true } } }, orderBy: { creadoEn: "asc" } },
      fondos: { orderBy: { creadoEn: "asc" } },
      cuentas: { orderBy: { creadoEn: "asc" } },
      obligaciones: { include: { proveedor: { select: { nombre: true } } }, orderBy: { creadoEn: "asc" } },
    },
  });
  a.deudas.sort(
    (x, y) => x.unidad.numero.localeCompare(y.unidad.numero, "es", { numeric: true }) || x.periodo.localeCompare(y.periodo) || x.concepto.localeCompare(y.concepto),
  );
  const datos: DatosApertura = {
    fechaCorte: a.fechaCorte,
    deudas: a.deudas,
    creditos: a.creditos,
    fondos: a.fondos,
    cuentas: a.cuentas,
    obligaciones: a.obligaciones,
  };
  return { apertura: a, datos, resumen: resumenApertura(datos) };
}

/**
 * Datos del informe de apertura (COM-001 · Entrega 6): solo conteos de estructura y personas,
 * nunca nombres. null si la comunidad no tiene apertura.
 */
export async function datosInformeApertura(condominioId: string, administradoraId: string, generadoPor: string): Promise<DatosInforme | null> {
  const c = await db.condominio.findFirst({
    where: { id: condominioId, administradoraId },
    include: { administradora: { select: { nombre: true } }, apertura: { select: { id: true } } },
  });
  if (!c?.apertura) return null;
  const [{ apertura, datos, resumen }, unidades, espacios, agrupaciones, instalaciones, vinculos, config] = await Promise.all([
    datosApertura(c.apertura.id),
    db.unidad.groupBy({ by: ["tipo"], where: { condominioId }, _count: { _all: true }, _sum: { alicuota: true } }),
    db.espacio.groupBy({ by: ["clase", "regimen", "destino"], where: { condominioId }, _count: { _all: true } }),
    db.agrupacion.count({ where: { condominioId } }),
    db.instalacion.count({ where: { condominioId } }),
    db.unidadPersona.findMany({ where: { unidad: { condominioId } }, select: { personaId: true, relacion: true } }),
    datosDeUna(administradoraId, condominioId),
  ]);
  const personas = (rel: string) => new Set(vinculos.filter((v) => v.relacion === rel).map((v) => v.personaId)).size;
  const revision = revisarApertura(datos, resumen);
  const pendientes = config
    ? requisitosPara(requisitosActivacion(config, revision), "HABILITADA_FINANCIERA")
        .filter((x) => !x.cumple && x.tipo !== "advertencia" && x.clave !== "apertura-completa")
        .map((x) => x.mensaje)
    : [];
  return {
    administradora: c.administradora.nombre,
    comunidad: {
      nombre: c.nombre,
      direccion: c.direccion,
      comuna: c.comuna,
      tipo: c.tipo,
      modalidad: c.modalidad,
      fechaIncorporacion: c.fechaIncorporacion,
      estado: c.estado,
    },
    apertura: {
      fechaCorte: apertura.fechaCorte,
      estado: apertura.estado,
      preparadoPor: apertura.preparadoPor,
      actualizadoEn: apertura.actualizadoEn,
      observaciones: apertura.observaciones,
    },
    estructura: {
      totalDeclarado: c.totalUnidades,
      unidadesPorTipo: unidades
        .map((u) => ({ tipo: u.tipo, cantidad: u._count._all }))
        .sort((a, b) => b.cantidad - a.cantidad),
      sumaAlicuotas: Math.round(unidades.reduce((s, u) => s + Number(u._sum.alicuota ?? 0), 0) * 1e6) / 1e6,
      agrupaciones,
      espacios: espacios.map((e) => ({
        clase: CLASES[e.clase].plural,
        regimen: REGIMENES[e.regimen].texto,
        destino: e.destino ? DESTINOS[e.destino].split(" (")[0] : "Sin definir",
        cantidad: e._count._all,
      })),
      instalaciones,
    },
    personas: {
      propietarios: personas("PROPIETARIO"),
      residentes: personas("RESIDENTE"),
      unidadesSinPropietario: config?.unidadesSinPropietario ?? 0,
      unidades: config?.unidades ?? 0,
    },
    datos: { ...datos, deudas: apertura.deudas, fondos: apertura.fondos, cuentas: apertura.cuentas, obligaciones: apertura.obligaciones },
    resumen,
    revision,
    pendientesActivacion: pendientes,
    generado: new Date(),
    generadoPor,
  };
}
