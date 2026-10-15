// Crea la cuenta de plataforma (SUPERADMIN) la primera vez que se publica el sistema.
// Toma el correo y la contraseña de PLATAFORMA_CORREO y PLATAFORMA_CLAVE.
// Si ya existe una cuenta de plataforma, no hace nada.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const correo = process.env.PLATAFORMA_CORREO?.trim().toLowerCase();
  const clave = process.env.PLATAFORMA_CLAVE ?? "";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    if (await db.usuario.findFirst({ where: { rol: "SUPERADMIN" } })) {
      console.log("La cuenta de plataforma ya existe.");
      return;
    }
    if (!correo || clave.length < 8) {
      console.log("Sin cuenta de plataforma: define PLATAFORMA_CORREO y PLATAFORMA_CLAVE (mínimo 8 caracteres).");
      return;
    }
    await db.usuario.create({
      data: { nombre: "Plataforma", correo, rol: "SUPERADMIN", claveHash: await bcrypt.hash(clave, 10) },
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
