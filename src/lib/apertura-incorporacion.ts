import "server-only";
// FIN-COMP · Entrega D · Incorporar la apertura de una comunidad existente a las finanzas de Convive.
//
// Hasta aquí la apertura era solo un registro de saldos. Al incorporarla (una sola vez, con la
// apertura «Lista para revisión» y la comunidad habilitada para finanzas) se crea, en una sola
// transacción:
//   - el mes de la fecha de corte como «mes de apertura»: emitido y cerrado;
//   - un aviso por unidad con sus deudas confirmadas o en convenio (las discutidas y por verificar
//     NO se cobran: quedan en la apertura hasta resolverse);
//   - los saldos a favor de cada unidad, como pagos «saldo a favor de la apertura»;
//   - los fondos con su saldo inicial (el fondo de reserva usa el de reserva);
//   - las cuentas bancarias que falten;
//   - las cuentas por pagar como egresos «por pagar» del mes de apertura.
// Nada de esto se recalcula después: si algo estaba mal, se corrige con movimientos nuevos.

import { db } from "@/lib/db";
import type { UsuarioActual } from "@/lib/auth";
import { registrarEn } from "@/lib/registro";
import { nombrePeriodo } from "@/lib/cobro";
import { registrarPagoEn, ErrorCobro } from "@/lib/cobro-servicio";
import { MENSAJE_SIN_FINANZAS, operaFinanzas } from "@/lib/configuracion";
import { revisarApertura, TIPOS_FONDO } from "@/lib/apertura";
import { datosApertura } from "@/lib/apertura-servicio";
import type { ResumenCierre } from "@/lib/cierre-servicio";

type Autor = Pick<UsuarioActual, "id" | "nombre" | "administradoraId">;

export class ErrorIncorporacion extends Error {}

const COBRABLES = new Set(["CONFIRMADA", "EN_CONVENIO"]);
const CATEGORIA_OBLIGACION: Record<string, string> = { PROVEEDOR: "Proveedores", REMUNERACION: "Remuneraciones", IMPUESTO: "Impuestos", OTRO: "Otros" };

/** Reparte el saldo de una deuda en las columnas del aviso según su concepto. */
function columnaDe(concepto: string): "gastoComun" | "fondoReserva" | "interes" | "cargos" {
  if (concepto === "Gasto común") return "gastoComun";
  if (concepto === "Fondo de reserva") return "fondoReserva";
  if (concepto === "Interés") return "interes";
  return "cargos";
}

export async function incorporarApertura(autor: Autor, condominioId: string) {
  const administradoraId = autor.administradoraId!;
  const c = await db.condominio.findFirst({ where: { id: condominioId, administradoraId }, include: { apertura: { select: { id: true } } } });
  if (!c?.apertura) throw new ErrorIncorporacion("Esta comunidad no tiene apertura.");
  if (!operaFinanzas(c.estado)) throw new ErrorIncorporacion(MENSAJE_SIN_FINANZAS);
  const aperturaId = c.apertura.id;

  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Apertura" WHERE id = ${aperturaId} FOR UPDATE`;
      const { apertura: a, datos, resumen } = await datosApertura(aperturaId);
      if (a.estado === "INCORPORADA") throw new ErrorIncorporacion("La apertura ya está incorporada.");
      if (a.estado !== "EN_REVISION") throw new ErrorIncorporacion("Primero marca la apertura «Lista para revisión».");
      const revision = revisarApertura(datos, resumen);
      if (!revision.ok) throw new ErrorIncorporacion(revision.bloqueos.join(" "));

      const corte = a.fechaCorte;
      const anio = corte.getUTCFullYear();
      const mes = corte.getUTCMonth() + 1;
      const conflicto = await tx.periodo.findFirst({
        where: { condominioId, OR: [{ anio: { lt: anio } }, { anio, mes: { lte: mes } }] },
        select: { anio: true, mes: true },
      });
      if (conflicto) {
        throw new ErrorIncorporacion(
          `Convive ya tiene ${nombrePeriodo(conflicto.anio, conflicto.mes)}, que es anterior o igual a la fecha de corte. La apertura tiene que ser anterior al primer mes cobrado en Convive.`,
        );
      }
      const ahora = new Date();
      const periodo = await tx.periodo.create({
        data: { administradoraId, condominioId, anio, mes, estado: "CERRADO", cerradoEn: ahora, vencimiento: corte, deApertura: true },
      });

      // 1) Deudas cobrables → un aviso por unidad.
      const porUnidad = new Map<string, { gastoComun: number; fondoReserva: number; interes: number; cargos: number }>();
      for (const d of a.deudas.filter((d) => COBRABLES.has(d.estado))) {
        const u = porUnidad.get(d.unidadId) ?? { gastoComun: 0, fondoReserva: 0, interes: 0, cargos: 0 };
        u[columnaDe(d.concepto)] += d.saldo;
        porUnidad.set(d.unidadId, u);
      }
      let emitido = 0;
      for (const [unidadId, u] of porUnidad) {
        const total = u.gastoComun + u.fondoReserva + u.interes + u.cargos;
        emitido += total;
        await tx.avisoCobro.create({ data: { administradoraId, periodoId: periodo.id, unidadId, ...u, total, saldo: total, vencimiento: corte, emitidoEn: ahora } });
      }

      // 2) Saldos a favor por unidad → pago «saldo a favor de la apertura» (se aplica a lo más antiguo).
      let creditos = 0;
      for (const cr of a.creditos.filter((x) => x.unidadId && x.monto > 0)) {
        try {
          await registrarPagoEn(tx, administradoraId, { unidadId: cr.unidadId!, monto: cr.monto, fecha: corte, medio: "OTRO", referencia: "Saldo a favor traído de la apertura" }, { permitirDuplicado: true });
        } catch (e) {
          if (e instanceof ErrorCobro) throw new ErrorIncorporacion(e.message);
          throw e;
        }
        creditos += cr.monto;
      }
      const sinUnidad = a.creditos.filter((x) => !x.unidadId).length;

      // 3) Fondos con saldo inicial.
      const idFondo = new Map<string, string>();
      let reservaUsada = false;
      for (const f of a.fondos) {
        const esReserva = f.tipo === "RESERVA" && !reservaUsada;
        if (esReserva) {
          reservaUsada = true;
          const existe = await tx.fondo.findFirst({ where: { condominioId, tipo: "RESERVA" } });
          const fondo = existe
            ? await tx.fondo.update({ where: { id: existe.id }, data: { saldoInicial: f.saldoContable } })
            : await tx.fondo.create({ data: { administradoraId, condominioId, nombre: "Fondo de reserva", tipo: "RESERVA", saldoInicial: f.saldoContable, creadoPor: autor.nombre } });
          idFondo.set(f.nombre.toLowerCase(), fondo.id);
        } else {
          const fondo = await tx.fondo.upsert({
            where: { condominioId_nombre: { condominioId, nombre: f.nombre } },
            update: { saldoInicial: f.saldoContable },
            create: { administradoraId, condominioId, nombre: f.nombre, tipo: "OTRO", saldoInicial: f.saldoContable, creadoPor: autor.nombre },
          });
          idFondo.set(f.nombre.toLowerCase(), fondo.id);
        }
      }

      // 4) Cuentas bancarias que falten (la caja chica no es cuenta de banco).
      const cuentasNuevas: string[] = [];
      for (const ct of a.cuentas.filter((x) => x.tipo !== "CAJA" && x.numeroFinal)) {
        const existe = await tx.cuentaBancaria.findFirst({ where: { condominioId, numeroFinal: ct.numeroFinal!, banco: { equals: ct.banco, mode: "insensitive" } } });
        if (existe) continue;
        await tx.cuentaBancaria.create({ data: { administradoraId, condominioId, banco: ct.banco, tipo: ct.tipo, numeroFinal: ct.numeroFinal!, creadoPor: autor.nombre } });
        cuentasNuevas.push(`${ct.banco} ···${ct.numeroFinal}`);
      }

      // 5) Cuentas por pagar → egresos «por pagar» del mes de apertura.
      let porPagar = 0;
      for (const o of a.obligaciones) {
        await tx.gasto.create({
          data: {
            administradoraId,
            periodoId: periodo.id,
            tipo: "COMUN",
            categoria: CATEGORIA_OBLIGACION[o.tipo] ?? "Otros",
            descripcion: `${o.acreedor} (saldo de apertura)`,
            proveedor: o.proveedor?.nombre ?? o.acreedor,
            proveedorId: o.proveedorId,
            documento: o.documento,
            monto: o.monto,
            fecha: o.fecha && o.fecha <= corte ? o.fecha : corte,
            estadoPago: "POR_PAGAR",
            fondoId: o.fondo ? (idFondo.get(o.fondo.toLowerCase()) ?? null) : null,
          },
        });
        porPagar += o.monto;
      }

      // 6) El mes de apertura queda cerrado, con su resumen.
      const noCobradas = a.deudas.filter((d) => !COBRABLES.has(d.estado));
      const advertencias = [
        "Mes de apertura: saldos traídos del sistema anterior a la fecha de corte.",
        ...(noCobradas.length ? [`${noCobradas.length} deuda(s) discutidas o por verificar no se cobran hasta resolverse (quedan en la apertura).`] : []),
        ...(sinUnidad ? [`${sinUnidad} pago(s) por identificar no se cargaron: asígnalos cuando se sepa de quién son.`] : []),
        ...revision.advertencias,
      ];
      const resumenCierre: ResumenCierre = {
        periodo: nombrePeriodo(anio, mes),
        comunidad: c.nombre,
        emitido,
        pendienteDelMes: emitido,
        gastosComunes: 0,
        gastosConFondo: 0,
        ingresosDelMes: creditos,
        pagosDelMes: a.creditos.filter((x) => x.unidadId && x.monto > 0).length,
        otrosIngresos: 0,
        egresosPagadosDelMes: 0,
        otrosEgresos: 0,
        morosidadVencida: emitido,
        transferenciasPendientes: { cantidad: 0, monto: 0 },
        bancos: a.cuentas.map((ct) => ({ cuenta: `${TIPOS_CUENTA_TEXTO[ct.tipo] ?? ct.tipo} ${ct.banco}${ct.numeroFinal ? ` ···${ct.numeroFinal}` : ""}`, movimientos: 0, abonos: 0, cargos: 0, saldoFinal: ct.saldoCartola })),
        fondos: a.fondos.map((f) => ({ nombre: f.nombre || TIPOS_FONDO[f.tipo], saldo: f.saldoContable })),
        advertencias,
        cerradoEn: ahora.toISOString(),
        cerradoPor: autor.nombre,
      };
      await tx.periodo.update({ where: { id: periodo.id }, data: { mesCerradoEn: ahora, mesCerradoPor: autor.nombre, resumenCierre } });
      await tx.apertura.update({ where: { id: aperturaId }, data: { estado: "INCORPORADA", incorporadaEn: ahora, incorporadaPor: autor.nombre } });
      const detalle = `${c.nombre}, corte ${corte.toISOString().slice(0, 10)}: ${porUnidad.size} aviso(s) de deuda por ${emitido}, ${resumenCierre.pagosDelMes} saldo(s) a favor por ${creditos}, ${a.fondos.length} fondo(s), ${cuentasNuevas.length} cuenta(s) nueva(s), ${a.obligaciones.length} cuenta(s) por pagar por ${porPagar}.`;
      await registrarEn(tx, {
        autor,
        accion: "Incorporó la apertura a las finanzas",
        detalle,
        condominioId,
        entidad: "Apertura",
        entidadId: aperturaId,
        antes: { estado: "Lista para revisión" },
        despues: { estado: "Incorporada", periodoApertura: nombrePeriodo(anio, mes) },
      });
      return { periodoId: periodo.id, avisos: porUnidad.size, emitido, creditos, porPagar, cuentasNuevas, noCobradas: noCobradas.length, sinUnidad };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

const TIPOS_CUENTA_TEXTO: Record<string, string> = { CORRIENTE: "Cta. cte.", VISTA: "Cta. vista", AHORRO: "Ahorro", CAJA: "Caja" };
