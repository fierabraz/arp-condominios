import "server-only";
// FIN-COMP · Comunidad ficticia para recorrer el ciclo financiero en una vista previa.
//
// - Solo existe fuera de producción (vista previa de Vercel o computador local): en producción la
//   función no hace nada y la pantalla no aparece.
// - Todos los datos son inventados: nombres, RUT y números de cuenta de fantasía. Los correos usan
//   example.com (dominio reservado que nunca recibe correos).
// - La comunidad queda marcada `demo` para distinguirla siempre de una real.

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { emitirPeriodo, registrarPago } from "@/lib/cobro-servicio";
import { sincronizarConstanciaEn } from "@/lib/constancias-servicio";
import { cargarRemuneraciones } from "@/lib/remuneraciones-servicio";
import { registrarEn } from "@/lib/registro";

/** true en la vista previa o en local; false en producción. */
export function demoPermitida() {
  return process.env.VERCEL_ENV !== "production";
}

const UNIDADES = ["101", "102", "103", "104", "201", "202", "203", "204"];
const NOMBRES = [
  "Ana Ficticia Rojas",
  "Bruno Ficticio Soto",
  "Carla Ficticia Muñoz",
  "Diego Ficticio Lagos",
  "Elena Ficticia Vera",
  "Felipe Ficticio Reyes",
  "Gloria Ficticia Paz",
  "Hugo Ficticio Leal",
];
// RUT inventados con dígito verificador válido (no corresponden a personas reales conocidas).
const RUTS = ["11.111.111-1", "12.222.222-K", "13.333.333-4", "14.444.444-7", "15.555.555-0", "16.666.666-3", "17.777.777-6", "18.888.888-9"];

const clave = () => randomBytes(9).toString("base64url");

/** Crea la comunidad ficticia completa: unidades, personas, un mes emitido y la cuenta verificada. */
export async function crearComunidadDemo(usuario: UsuarioActual) {
  if (!demoPermitida()) throw new Error("La comunidad de prueba solo se puede crear en una vista previa.");
  const administradoraId = usuario.administradoraId!;
  const sufijo = randomBytes(3).toString("hex");
  const ahora = new Date();
  // El mes anterior al actual, para que sus avisos ya estén emitidos y por vencer o vencidos.
  const mesAnterior = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1));
  const anio = mesAnterior.getUTCFullYear();
  const mes = mesAnterior.getUTCMonth() + 1;

  let datosDemo = { residenteId: "" };
  const c = await db.$transaction(async (tx) => {
    const c = await tx.condominio.create({
      data: {
        administradoraId,
        nombre: `Edificio Los Aromos (demo ${sufijo})`,
        direccion: "Calle Inventada 123",
        comuna: "Comuna Ficticia",
        estado: "HABILITADA_FINANCIERA",
        estadoCambiadoEn: ahora,
        porcentajeReserva: 5,
        tasaInteresMora: 0,
        diaVencimiento: 10,
        totalUnidades: UNIDADES.length,
        demo: true,
        // FIN-003.3: en la comunidad ficticia la verificación automática parte activada para probarla.
        verificacionAutomatica: true,
        observaciones: "Comunidad FICTICIA (PILOTO-001) creada para probar el ciclo financiero. No contiene datos reales.",
      },
    });
    if (!usuario.accesoTodas) await tx.asignacionCondominio.create({ data: { usuarioId: usuario.id, condominioId: c.id } });
    let residenteId = "";
    for (let i = 0; i < UNIDADES.length; i++) {
      const u = await tx.unidad.create({ data: { administradoraId, condominioId: c.id, numero: UNIDADES[i], alicuota: 12.5 } });
      const p = await tx.persona.create({ data: { administradoraId, nombre: NOMBRES[i], documento: RUTS[i] } });
      await tx.unidadPersona.create({ data: { unidadId: u.id, personaId: p.id, relacion: "PROPIETARIO" } });
      if (i === 0) {
        residenteId = (await tx.usuario.create({
          data: {
            administradoraId,
            nombre: NOMBRES[0],
            correo: `residente101.${sufijo}@example.com`,
            claveHash: await bcrypt.hash(clave(), 10),
            rol: "RESIDENTE",
            personaId: p.id,
          },
        })).id;
      }
    }
    const periodo = await tx.periodo.create({ data: { administradoraId, condominioId: c.id, anio, mes } });
    const fecha = new Date(Date.UTC(anio, mes - 1, 15));
    for (const [categoria, descripcion, proveedor, monto] of [
      ["Aseo", "Servicio de aseo mensual", "Aseo Ficticio Ltda.", 400000],
      ["Electricidad", "Consumo eléctrico áreas comunes", "Eléctrica Inventada S.A.", 200000],
      ["Mantención", "Mantención de ascensor", "Ascensores de Fantasía SpA", 200000],
    ] as const) {
      await tx.gasto.create({ data: { administradoraId, periodoId: periodo.id, tipo: "COMUN", categoria, descripcion, proveedor, documento: `F-${sufijo}`, monto, fecha } });
    }
    // FIN-COMP B/D: fondos con saldo traído, un egreso pagado con el fondo de reserva y el personal.
    const reserva = await tx.fondo.create({ data: { administradoraId, condominioId: c.id, nombre: "Fondo de reserva", tipo: "RESERVA", saldoInicial: 1_500_000, creadoPor: usuario.nombre } });
    await tx.fondo.create({ data: { administradoraId, condominioId: c.id, nombre: "Fondo de proyectos", tipo: "OTRO", saldoInicial: 600_000, creadoPor: usuario.nombre } });
    await tx.gasto.create({
      data: {
        administradoraId, periodoId: periodo.id, tipo: "COMUN", categoria: "Reparaciones", descripcion: "Reparación bomba de agua", proveedor: "Gasfitería Imaginaria",
        documento: `F-${sufijo}-B`, monto: 180_000, fecha, fondoId: reserva.id, estadoPago: "PAGADO", fechaPago: fecha, medioPago: "TRANSFERENCIA", pagadoPor: usuario.nombre,
      },
    });
    for (const [nombre, cargo, liquido, imposiciones] of [
      ["Conserje Ficticio Uno", "Conserje", 650_000, 180_000],
      ["Auxiliar Ficticia de Aseo", "Aseo", 520_000, 140_000],
    ] as const) {
      await tx.trabajador.create({ data: { administradoraId, condominioId: c.id, nombre, cargo, liquido, imposiciones, creadoPor: usuario.nombre } });
    }
    datosDemo = { residenteId };
    await tx.cuentaBancaria.create({
      data: {
        administradoraId,
        condominioId: c.id,
        banco: "Banco Ficticio",
        tipo: "CORRIENTE",
        numeroFinal: "6789",
        numeroCuenta: "000123456789",
        titular: "Edificio Los Aromos (ficticio)",
        rutTitular: "76.086.428-5",
        correoPagos: "pagos@example.com",
        recibePagos: true,
        verificadaEn: ahora,
        verificadaPor: `${usuario.nombre} (comunidad de prueba)`,
        creadoPor: usuario.nombre,
      },
    });
    await registrarEn(tx, {
      autor: usuario,
      accion: "Creó una comunidad ficticia de prueba",
      detalle: `${c.nombre}: ${UNIDADES.length} unidades, gastos de ${mes}/${anio} y cuenta bancaria ficticia. Solo datos inventados.`,
      condominioId: c.id,
      entidad: "Condominio",
      entidadId: c.id,
    });
    return { ...c, periodoId: periodo.id };
  });
  // Emitir con la función de siempre (la misma que usa la administración).
  await emitirPeriodo(c.periodoId, administradoraId);

  // Dos pagos en efectivo del mes emitido y una transferencia informada pendiente de verificación
  // (con su constancia versión 1), para recorrer Recaudación, Conciliación y el cierre del mes.
  const unidades = await db.unidad.findMany({ where: { condominioId: c.id }, select: { id: true, numero: true } });
  const de = (numero: string) => unidades.find((u) => u.numero === numero)!.id;
  for (const numero of ["104", "201"]) {
    await registrarPago(administradoraId, { unidadId: de(numero), monto: 105_000, fecha: new Date(Date.UTC(anio, mes - 1, 20)), medio: "EFECTIVO", referencia: "Pago ficticio en efectivo" });
  }
  const aviso101 = await db.avisoCobro.findFirst({ where: { periodoId: c.periodoId, unidadId: de("101") }, select: { id: true } });
  await db.$transaction(async (tx) => {
    const t = await tx.transferenciaInformada.create({
      data: {
        administradoraId, condominioId: c.id, unidadId: de("101"), avisoId: aviso101?.id ?? null, usuarioId: datosDemo.residenteId || null, informante: NOMBRES[0],
        fecha: new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - 2)), monto: 30_000, bancoOrigen: "Banco Ficticio", operacion: `DEMO-${sufijo}`,
        observaciones: "Transferencia ficticia de la comunidad demo.", deudaAlInformar: 105_000,
      },
    });
    await sincronizarConstanciaEn(tx, t.id, NOMBRES[0]);
  });
  // Mes actual abierto, con las remuneraciones cargadas como egresos por pagar.
  const actual = await db.periodo.create({ data: { administradoraId, condominioId: c.id, anio: ahora.getUTCFullYear(), mes: ahora.getUTCMonth() + 1 } });
  await cargarRemuneraciones(usuario, actual.id);
  return c;
}

/** Nueva clave para el residente ficticio de la unidad 101 (se muestra una sola vez). */
export async function nuevaClaveResidenteDemo(condominioId: string, administradoraId: string) {
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId, demo: true } });
  if (!c || !demoPermitida()) return null;
  const usuario = await db.usuario.findFirst({
    where: { administradoraId, rol: "RESIDENTE", persona: { unidades: { some: { unidad: { condominioId } } } } },
  });
  if (!usuario) return null;
  const nueva = clave();
  await db.usuario.update({ where: { id: usuario.id }, data: { claveHash: await bcrypt.hash(nueva, 10), claveActualizadaEn: new Date() } });
  return { correo: usuario.correo, clave: nueva };
}

const fmt = (n: number) => n.toLocaleString("es-CL");
const fechaCsv = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("-");

/**
 * Cartola ficticia en CSV, con fechas de estos días. La 2 repite todas las filas de la 1 (para
 * probar que no se duplican) y agrega al final el abono de $50.000 de la unidad 101.
 */
export function cartolaDemo(numero: 1 | 2, hoy = new Date()) {
  const dia = (n: number) => new Date(hoy.getTime() - n * 86_400_000);
  const filas: [Date, string, string, number][] = [
    [dia(6), "PAGO PROVEEDOR ASEO FICTICIO LTDA", "880101", -400000],
    [dia(5), "TRANSF DE BRUNO FICTICIO SOTO GC 102", "880102", 105000],
    [dia(4), "PAGO ELECTRICA INVENTADA SA", "880103", -200000],
    [dia(3), "TRANSF DE CARLA FICTICIA MUNOZ", "880104", 105000],
    [dia(2), "INTERESES CUENTA", "880105", 1250],
  ];
  if (numero === 2) filas.push([dia(0), "TRANSF DE ANA FICTICIA ROJAS GC 101", "880106", 50000]);
  let saldo = 2_000_000;
  const lineas = ["Banco Ficticio - Movimientos cuenta ****6789 - DATOS FICTICIOS", "", "Fecha;Descripción;N° operación;Cargos;Abonos;Saldo"];
  for (const [f, desc, op, monto] of filas) {
    saldo += monto;
    lineas.push(`${fechaCsv(f)};"${desc}";${op};${monto < 0 ? fmt(-monto) : ""};${monto > 0 ? fmt(monto) : ""};${fmt(saldo)}`);
  }
  return lineas.join("\r\n") + "\r\n";
}
