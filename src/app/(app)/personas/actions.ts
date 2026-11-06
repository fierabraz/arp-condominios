"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdministradora } from "@/lib/auth";
import { filtroPersonas } from "@/lib/permisos";
import { aTexto, erroresDe, type EstadoForm } from "@/lib/forms";
import { registrar } from "@/lib/registro";
import { buscarDuplicado } from "@/lib/vinculos";
import { motivosParaNoEliminar, sinUso } from "@/lib/personas";

const PersonaSchema = z.object({
  nombre: z.string({ error: "Ingresa el nombre." }).min(2, { error: "Ingresa el nombre." }),
  documento: z.string().optional(),
  correo: z.email({ error: "Correo no válido." }).optional(),
  telefono: z.string().optional(),
});

/**
 * Revisa que no sea una persona ya registrada en la administradora (COM-001). Mismo RUT o correo:
 * no se crea. Mismo nombre: se pide confirmar. El nombre de la otra solo se muestra si esta cuenta la puede ver.
 */
async function revisarDuplicado(
  datos: { nombre: string; documento?: string; correo?: string },
  formData: FormData,
  administradoraId: string,
  usuario: Parameters<typeof filtroPersonas>[0],
  excluirId?: string,
): Promise<EstadoForm | null> {
  const personas = await db.persona.findMany({ where: { administradoraId }, select: { id: true, nombre: true, documento: true, correo: true } });
  const dup = buscarDuplicado(datos, personas, excluirId);
  if (!dup) return null;
  const valores = Object.fromEntries(["nombre", "documento", "correo", "telefono"].map((k) => [k, String(formData.get(k) ?? "")]));
  const visible = await db.persona.count({ where: { id: dup.persona.id, administradoraId, ...filtroPersonas(usuario) } });
  const quien = visible ? dup.persona.nombre : "otra persona registrada en la administradora";
  if (dup.tipo === "documento") return { valores, errores: { documento: [`Ese RUT ya es de ${quien}. No se crea otra ficha: vincula a la persona existente.`] } };
  if (dup.tipo === "correo") return { valores, errores: { correo: [`Ese correo ya es de ${quien}.`] } };
  if (formData.get("confirmarNombre") === "on") return null;
  return {
    valores,
    errores: { confirmarNombre: [`Ya hay ${visible ? `una persona llamada ${dup.persona.nombre}` : "una persona con ese nombre"}. Si es otra persona, márcalo y vuelve a guardar.`] },
  };
}

function leerPersona(formData: FormData) {
  return PersonaSchema.safeParse({
    nombre: aTexto(formData.get("nombre")),
    documento: aTexto(formData.get("documento")),
    correo: aTexto(formData.get("correo"))?.toLowerCase(),
    telefono: aTexto(formData.get("telefono")),
  });
}

export async function crearPersona(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leerPersona(formData);
  if (!datos.success) return erroresDe(datos.error);
  const dup = await revisarDuplicado(datos.data, formData, administradoraId, usuario);
  if (dup) return dup;
  await db.persona.create({ data: { ...datos.data, administradoraId } });
  await registrar(usuario, "Registró una persona", datos.data.nombre);
  revalidatePath("/personas");
  return { ok: true, mensaje: `${datos.data.nombre} registrado.` };
}

export async function editarPersona(id: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario, administradoraId } = await requireAdministradora();
  const datos = leerPersona(formData);
  if (!datos.success) return erroresDe(datos.error);
  const dup = await revisarDuplicado(datos.data, formData, administradoraId, usuario, id);
  if (dup) return dup;
  const { count } = await db.persona.updateMany({ where: { id, administradoraId, ...filtroPersonas(usuario) }, data: datos.data });
  if (count === 0) return { mensaje: "Persona no encontrada." };
  await registrar(usuario, "Editó los datos de una persona", datos.data.nombre);
  revalidatePath("/personas");
  return { ok: true, mensaje: "Cambios guardados." };
}

export async function eliminarPersona(id: string) {
  const { usuario, administradoraId } = await requireAdministradora();
  const persona = await db.persona.findFirst({
    where: { id, administradoraId, ...filtroPersonas(usuario) },
    select: { nombre: true, _count: { select: { vinculos: true, unidades: true } }, usuario: { select: { id: true } } },
  });
  if (!persona) redirect("/personas");
  // SEG-20: quien tiene o tuvo vínculos, está en una unidad o tiene cuenta no se borra.
  // La página explica qué hacer antes; la condición se repite al borrar por si algo cambió entre medio.
  const motivos = motivosParaNoEliminar({
    unidades: persona._count.unidades,
    vinculos: persona._count.vinculos,
    tieneCuenta: !!persona.usuario,
  });
  if (motivos.length > 0) redirect(`/personas/${id}`);
  const { count } = await db.persona.deleteMany({ where: { id, administradoraId, ...sinUso } });
  if (count === 0) redirect(`/personas/${id}`);
  await registrar(usuario, "Borró una persona", persona.nombre);
  revalidatePath("/personas");
  redirect("/personas");
}
