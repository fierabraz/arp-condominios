"use server";

// PAG-001 · Datos para transferir de la comunidad (lo que ven los residentes al pulsar «Pagar»).
// Solo administradores con permiso pagos.verificar, en comunidades de su alcance. Todo cambio
// queda en el registro, y cambiar un dato borra la verificación: hay que volver a verificar.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { erroresDe, type EstadoForm } from "@/lib/forms";
import { registrarEn } from "@/lib/registro";
import { faltantesCuentaPago, normalizarRut, rutValido, soloDigitos } from "@/lib/pagos";

const ruta = (condominioId: string) => `/condominios/${condominioId}/datos-pago`;

async function acceso(condominioId: string) {
  const { usuario, administradoraId } = await requireAdministradora("pagos.verificar");
  const condominio = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, select: { id: true, nombre: true } });
  if (!condominio || !puedeVerPropiedad(usuario, condominioId)) return null;
  return { usuario, administradoraId, condominio };
}

const DatosSchema = z.object({
  banco: z.string().trim().min(2, { error: "Elige el banco." }).max(60),
  tipo: z.enum(["CORRIENTE", "VISTA", "AHORRO"], { error: "Elige el tipo de cuenta." }),
  numeroCuenta: z
    .string()
    .transform(soloDigitos)
    .refine((s) => s.length >= 6 && s.length <= 20, { error: "Escribe el número de cuenta completo (solo números)." }),
  titular: z.string().trim().min(3, { error: "Escribe el nombre del titular de la cuenta." }).max(100),
  rutTitular: z
    .string()
    .transform(normalizarRut)
    .refine(rutValido, { error: "El RUT del titular no es válido (revisa el dígito verificador)." }),
  correoPagos: z.union([z.literal(""), z.email({ error: "Escribe un correo válido o déjalo vacío." }).trim().toLowerCase()]),
  recibePagos: z.boolean(),
});

const campos = ["banco", "tipo", "numeroCuenta", "titular", "rutTitular", "correoPagos", "recibePagos"] as const;

/** Crea la cuenta (si cuentaId es null) o completa sus datos para recibir transferencias. */
export async function guardarDatosPago(condominioId: string, cuentaId: string | null, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const valores = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const otro = String(formData.get("bancoOtro") ?? "").trim();
  const previa = cuentaId
    ? await db.cuentaBancaria.findFirst({ where: { id: cuentaId, condominioId, administradoraId: a.administradoraId, activa: true } })
    : null;
  if (cuentaId && !previa) return { mensaje: "Esa cuenta ya no existe." };
  const datos = DatosSchema.safeParse({
    banco: previa ? previa.banco : formData.get("banco") === "Otro" ? otro : String(formData.get("banco") ?? ""),
    tipo: formData.get("tipo"),
    numeroCuenta: String(formData.get("numeroCuenta") ?? ""),
    titular: String(formData.get("titular") ?? ""),
    rutTitular: String(formData.get("rutTitular") ?? ""),
    correoPagos: String(formData.get("correoPagos") ?? "").trim(),
    recibePagos: formData.get("recibePagos") === "on",
  });
  if (!datos.success) return { ...erroresDe(datos.error), valores };
  const d = { ...datos.data, correoPagos: datos.data.correoPagos || null };
  // El número completo debe calzar con los 4 dígitos con que se identifican sus cartolas.
  if (previa && !d.numeroCuenta.endsWith(previa.numeroFinal)) {
    return { errores: { numeroCuenta: [`Esta cuenta termina en ${previa.numeroFinal}. Si es otra cuenta, regístrala aparte.`] }, valores };
  }
  const numeroFinal = d.numeroCuenta.slice(-4);
  if (!previa) {
    const repetida = await db.cuentaBancaria.findFirst({ where: { condominioId, banco: d.banco, numeroFinal } });
    if (repetida) return { mensaje: `Ya está registrada la cuenta ${d.banco} terminada en ${numeroFinal}. Complétala en su tarjeta.`, valores };
  }

  const cambio = !previa || campos.some((c) => String(previa[c] ?? "") !== String(d[c] ?? ""));
  if (!cambio) return { ok: true, mensaje: "No había cambios." };
  await db.$transaction(async (tx) => {
    const cuenta = previa
      ? await tx.cuentaBancaria.update({
          where: { id: previa.id },
          // Cualquier cambio borra la verificación: los residentes dejan de ver los datos hasta verificarlos de nuevo.
          data: { ...d, verificadaEn: null, verificadaPor: null },
        })
      : await tx.cuentaBancaria.create({
          data: { ...d, numeroFinal, administradoraId: a.administradoraId, condominioId, creadoPor: a.usuario.nombre },
        });
    // Una sola cuenta recibe los pagos de los residentes.
    if (d.recibePagos) {
      await tx.cuentaBancaria.updateMany({
        where: { condominioId, id: { not: cuenta.id }, recibePagos: true },
        data: { recibePagos: false },
      });
    }
    await registrarEn(tx, {
      autor: a.usuario,
      accion: previa ? "Cambió los datos para transferir" : "Registró la cuenta para transferir",
      detalle: `${a.condominio.nombre}: ${cuenta.banco} ···${cuenta.numeroFinal}${d.recibePagos ? " (recibe pagos; pendiente de verificar)" : ""}`,
      condominioId,
      entidad: "CuentaBancaria",
      entidadId: cuenta.id,
      antes: previa ? { banco: previa.banco, tipo: previa.tipo, numeroFinal: previa.numeroFinal, titular: previa.titular, recibePagos: previa.recibePagos, verificada: !!previa.verificadaEn } : undefined,
      despues: { banco: cuenta.banco, tipo: cuenta.tipo, numeroFinal: cuenta.numeroFinal, titular: cuenta.titular, recibePagos: cuenta.recibePagos, verificada: false },
    });
  });
  revalidatePath(ruta(condominioId));
  return { ok: true, mensaje: "Datos guardados. Revisa que estén correctos y márcalos como verificados para publicarlos." };
}

/** Publica la cuenta para los residentes: alguien de la administración confirma que los datos son correctos. */
export async function verificarCuentaPago(condominioId: string, cuentaId: string, _: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  if (formData.get("revisado") !== "on") return { mensaje: "Marca la casilla para confirmar que comparaste los datos con el banco." };
  const cuenta = await db.cuentaBancaria.findFirst({ where: { id: cuentaId, condominioId, administradoraId: a.administradoraId, activa: true } });
  if (!cuenta) return { mensaje: "Esa cuenta ya no existe." };
  if (!cuenta.recibePagos) return { mensaje: "Primero marca la cuenta para recibir los pagos de los residentes." };
  const faltan = faltantesCuentaPago(cuenta);
  if (faltan.length) return { mensaje: `Falta: ${faltan.join(", ")}.` };
  await db.$transaction(async (tx) => {
    await tx.cuentaBancaria.update({ where: { id: cuenta.id }, data: { verificadaEn: new Date(), verificadaPor: a.usuario.nombre } });
    await registrarEn(tx, {
      autor: a.usuario,
      accion: "Verificó y publicó los datos para transferir",
      detalle: `${a.condominio.nombre}: ${cuenta.banco} ···${cuenta.numeroFinal}. Los residentes ya ven estos datos al pulsar «Pagar».`,
      condominioId,
      entidad: "CuentaBancaria",
      entidadId: cuenta.id,
      antes: { verificada: false },
      despues: { verificada: true },
    });
  });
  revalidatePath(ruta(condominioId));
  return { ok: true };
}

/** Deja de mostrar la cuenta a los residentes (por ejemplo, si la comunidad cambió de banco). */
export async function despublicarCuentaPago(condominioId: string, cuentaId: string): Promise<EstadoForm> {
  const a = await acceso(condominioId);
  if (!a) return { mensaje: "Comunidad no encontrada." };
  const cuenta = await db.cuentaBancaria.findFirst({ where: { id: cuentaId, condominioId, administradoraId: a.administradoraId } });
  if (!cuenta) return { mensaje: "Esa cuenta ya no existe." };
  await db.$transaction(async (tx) => {
    await tx.cuentaBancaria.update({ where: { id: cuenta.id }, data: { verificadaEn: null, verificadaPor: null } });
    await registrarEn(tx, {
      autor: a.usuario,
      accion: "Quitó la publicación de los datos para transferir",
      detalle: `${a.condominio.nombre}: ${cuenta.banco} ···${cuenta.numeroFinal}. Los residentes ya no ven datos para transferir.`,
      condominioId,
      entidad: "CuentaBancaria",
      entidadId: cuenta.id,
      antes: { verificada: !!cuenta.verificadaEn },
      despues: { verificada: false },
    });
  });
  revalidatePath(ruta(condominioId));
  return { ok: true };
}
