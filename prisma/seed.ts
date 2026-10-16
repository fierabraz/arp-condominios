// Datos de demostración. Ejecutar con: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { emitirPeriodo, registrarPago } from "../src/lib/cobro-servicio";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const CLAVE_DEMO = "demo1234";

async function main() {
  const claveHash = await bcrypt.hash(CLAVE_DEMO, 10);

  await db.usuario.upsert({
    where: { correo: "plataforma@demo.cl" },
    update: {},
    create: { nombre: "Dueño de la plataforma", correo: "plataforma@demo.cl", claveHash, rol: "SUPERADMIN" },
  });

  if (await db.administradora.findFirst({ where: { nombre: "Administradora Demo" } })) {
    console.log("Los datos de demostración ya existen.");
    return;
  }

  const adm = await db.administradora.create({ data: { nombre: "Administradora Demo" } });
  const condominio = await db.condominio.create({
    data: {
      administradoraId: adm.id,
      nombre: "Edificio Los Aromos",
      direccion: "Av. Providencia 1234",
      comuna: "Providencia",
      porcentajeReserva: 5,
      tasaInteresMora: 1.5,
    },
  });

  // 8 departamentos de 11 % y 4 de 3 % = 100 %
  const unidades = [];
  for (let piso = 1; piso <= 4; piso++) {
    for (const n of [1, 2]) {
      unidades.push({ numero: `${piso}0${n}`, tipo: "DEPARTAMENTO" as const, alicuota: 11 });
    }
  }
  for (let i = 1; i <= 4; i++) unidades.push({ numero: `E${i}`, tipo: "ESTACIONAMIENTO" as const, alicuota: 3 });
  const creadas = await Promise.all(
    unidades.map((u) =>
      db.unidad.create({ data: { ...u, administradoraId: adm.id, condominioId: condominio.id } }),
    ),
  );

  const personas = await Promise.all(
    [
      { nombre: "María González", documento: "12.345.678-9", correo: "maria@demo.cl" },
      { nombre: "Juan Pérez", documento: "11.222.333-4", correo: "juan@demo.cl" },
      { nombre: "Carla Rojas", documento: "15.666.777-8", correo: "carla@demo.cl" },
    ].map((p) => db.persona.create({ data: { ...p, administradoraId: adm.id } })),
  );
  const [maria, juan, carla] = personas;
  const unidad = (numero: string) => creadas.find((u) => u.numero === numero)!.id;

  await db.unidadPersona.createMany({
    data: [
      { unidadId: unidad("101"), personaId: maria.id, relacion: "PROPIETARIO" },
      { unidadId: unidad("101"), personaId: maria.id, relacion: "RESIDENTE" },
      { unidadId: unidad("E1"), personaId: maria.id, relacion: "PROPIETARIO" },
      { unidadId: unidad("102"), personaId: juan.id, relacion: "PROPIETARIO" },
      { unidadId: unidad("102"), personaId: carla.id, relacion: "RESIDENTE" },
    ],
  });

  await db.usuario.createMany({
    data: [
      { nombre: "Ana Administradora", correo: "admin@demo.cl", claveHash, rol: "ADMINISTRADOR", administradoraId: adm.id },
      { nombre: "Pedro Tesorero", correo: "comite@demo.cl", claveHash, rol: "COMITE", administradoraId: adm.id, condominioId: condominio.id },
      { nombre: "María González", correo: "maria@demo.cl", claveHash, rol: "RESIDENTE", administradoraId: adm.id, personaId: maria.id },
    ],
  });

  await db.proveedor.createMany({
    data: [
      { nombre: "Enel", rubro: "Electricidad", telefono: "600 696 0000" },
      { nombre: "Aguas Andinas", rubro: "Agua potable", telefono: "600 331 1000" },
      { nombre: "Limpiezas Sur", rubro: "Aseo", rut: "76.123.456-7", contacto: "Rosa Pérez", correo: "contacto@limpiezassur.cl" },
      { nombre: "Ascensores Chile", rubro: "Mantención de ascensores", rut: "77.987.654-3", telefono: "+56 2 2345 6789" },
    ].map((p) => ({ ...p, administradoraId: adm.id })),
  });

  // Septiembre 2026 cerrado, con pagos parciales para que haya morosidad.
  const septiembre = await db.periodo.create({
    data: { administradoraId: adm.id, condominioId: condominio.id, anio: 2026, mes: 9 },
  });
  const gastosComunes: [string, string, string, number][] = [
    ["Remuneraciones", "Sueldo conserje", "Juan Muñoz", 1_200_000],
    ["Electricidad", "Luz áreas comunes", "Enel", 180_000],
    ["Agua", "Agua áreas comunes", "Aguas Andinas", 95_000],
    ["Aseo", "Servicio de aseo", "Limpiezas Sur", 150_000],
    ["Mantención", "Mantención ascensor", "Ascensores Chile", 220_000],
  ];
  await db.gasto.createMany({
    data: [
      ...gastosComunes.map(([categoria, descripcion, proveedor, monto]) => ({
        administradoraId: adm.id,
        periodoId: septiembre.id,
        tipo: "COMUN" as const,
        categoria,
        descripcion,
        proveedor,
        monto,
        fecha: new Date("2026-09-25T12:00:00Z"),
      })),
      {
        administradoraId: adm.id,
        periodoId: septiembre.id,
        tipo: "INDIVIDUAL" as const,
        unidadId: unidad("201"),
        categoria: "Multa",
        descripcion: "Ruidos molestos",
        monto: 25_000,
        fecha: new Date("2026-09-18T12:00:00Z"),
      },
    ],
  });
  await emitirPeriodo(septiembre.id, adm.id);

  const avisos = await db.avisoCobro.findMany({ where: { periodoId: septiembre.id }, include: { unidad: true } });
  for (const aviso of avisos) {
    const numero = aviso.unidad.numero;
    if (["201", "302", "401"].includes(numero)) continue; // morosos
    const monto = numero === "102" ? 50_000 : Number(aviso.total);
    await registrarPago(adm.id, {
      unidadId: aviso.unidadId,
      monto,
      fecha: new Date("2026-10-08T12:00:00Z"),
      medio: "TRANSFERENCIA",
    });
  }

  // Octubre 2026 abierto, con algunos gastos cargados.
  const octubre = await db.periodo.create({
    data: { administradoraId: adm.id, condominioId: condominio.id, anio: 2026, mes: 10 },
  });
  await db.gasto.createMany({
    data: gastosComunes.slice(0, 3).map(([categoria, descripcion, proveedor, monto]) => ({
      administradoraId: adm.id,
      periodoId: octubre.id,
      tipo: "COMUN" as const,
      categoria,
      descripcion,
      proveedor,
      monto,
      fecha: new Date("2026-10-05T12:00:00Z"),
    })),
  });

  console.log(`Datos de demostración creados. Contraseña de todas las cuentas: ${CLAVE_DEMO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
