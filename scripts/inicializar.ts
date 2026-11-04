// Prepara la cuenta de plataforma (SUPERADMIN) en cada publicación.
// - La primera vez la crea con PLATAFORMA_CORREO y PLATAFORMA_CLAVE.
// - Si se olvidó la clave: se define PLATAFORMA_RESTABLECER_CLAVE con una clave nueva (mínimo 8
//   caracteres), se publica, se ingresa con ella y después se borra esa variable.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const correo = process.env.PLATAFORMA_CORREO?.trim().toLowerCase();
  const clave = process.env.PLATAFORMA_CLAVE ?? "";
  const restablecer = process.env.PLATAFORMA_RESTABLECER_CLAVE ?? "";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existente =
      (correo && (await db.usuario.findFirst({ where: { rol: "SUPERADMIN", correo } }))) ||
      (await db.usuario.findFirst({ where: { rol: "SUPERADMIN" }, orderBy: { creadoEn: "asc" } }));

    if (existente) {
      if (!restablecer) {
        console.log(`La cuenta de plataforma ya existe (${existente.correo}).`);
        return;
      }
      if (restablecer.length < 8) {
        console.log("PLATAFORMA_RESTABLECER_CLAVE debe tener al menos 8 caracteres; no se cambió nada.");
        return;
      }
      // Solo se cambia si es distinta, para no cerrar sesiones en cada publicación mientras la variable siga puesta.
      if (await bcrypt.compare(restablecer, existente.claveHash)) {
        console.log(`La clave de plataforma ya es la de PLATAFORMA_RESTABLECER_CLAVE. Borra esa variable.`);
        return;
      }
      await db.usuario.update({
        where: { id: existente.id },
        data: { claveHash: await bcrypt.hash(restablecer, 10), claveActualizadaEn: new Date(), activo: true },
      });
      // Desbloquea el ingreso si quedó bloqueado por intentos fallidos.
      await db.intentoIngreso.create({ data: { correo: existente.correo, exitoso: true } });
      console.log(`Clave de plataforma restablecida para ${existente.correo}. Borra PLATAFORMA_RESTABLECER_CLAVE.`);
      return;
    }

    const claveInicial = clave || restablecer;
    if (!correo || claveInicial.length < 8) {
      console.log("Sin cuenta de plataforma: define PLATAFORMA_CORREO y PLATAFORMA_CLAVE (mínimo 8 caracteres).");
      return;
    }
    await db.usuario.create({
      data: { nombre: "Plataforma", correo, rol: "SUPERADMIN", claveHash: await bcrypt.hash(claveInicial, 10) },
    });
    console.log(`Cuenta de plataforma creada: ${correo}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
