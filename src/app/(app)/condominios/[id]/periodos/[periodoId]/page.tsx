import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, PageHeader, Tabla, Vacio } from "@/components/ui";
import { formatoFecha, formatoMoneda, hoyISO } from "@/lib/formato";
import { nombrePeriodo } from "@/lib/cobro";
import { ErrorCobro, previsualizarPeriodo } from "@/lib/cobro-servicio";
import { agregarGasto, cerrarPeriodo, eliminarGasto } from "../../../cobro-actions";
import { condominioVisible } from "../../condominio-actual";
import { NavCondominio } from "../../nav-condominio";
import { GastoForm } from "./gasto-form";
import { CerrarForm } from "./cerrar-form";

type Linea = { unidadId: string; gastoComun: number; fondoReserva: number; cargos: number; interes: number; total: number; saldo?: number };

export default async function PeriodoPage({ params }: PageProps<"/condominios/[id]/periodos/[periodoId]">) {
  const { id, periodoId } = await params;
  const { condominio, editable, moneda, administradoraId } = await condominioVisible(id);

  const periodo = await db.periodo.findFirst({
    where: { id: periodoId, condominioId: id },
    include: {
      gastos: { orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }], include: { unidad: { select: { numero: true } } } },
      avisos: true,
    },
  });
  if (!periodo) notFound();
  const unidades = await db.unidad.findMany({
    where: { condominioId: id },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true },
  });
  const numeroDe = new Map(unidades.map((u) => [u.id, u.numero]));
  const abierto = periodo.estado === "ABIERTO";
  const nombre = nombrePeriodo(periodo.anio, periodo.mes);
  const $ = (n: number | { toString(): string }) => formatoMoneda(n, moneda);

  const totalComun = periodo.gastos.filter((g) => g.tipo === "COMUN").reduce((s, g) => s + Number(g.monto), 0);
  const totalIndividual = periodo.gastos.filter((g) => g.tipo === "INDIVIDUAL").reduce((s, g) => s + Number(g.monto), 0);

  let lineas: Linea[] = [];
  let errorPrevia: string | undefined;
  if (abierto) {
    try {
      lineas = await previsualizarPeriodo(periodoId, administradoraId);
    } catch (e) {
      if (!(e instanceof ErrorCobro)) throw e;
      errorPrevia = e.message;
    }
  } else {
    lineas = periodo.avisos.map((a) => ({
      unidadId: a.unidadId,
      gastoComun: Number(a.gastoComun),
      fondoReserva: Number(a.fondoReserva),
      cargos: Number(a.cargos),
      interes: Number(a.interes),
      total: Number(a.total),
      saldo: Number(a.saldo),
    }));
    lineas.sort((a, b) => (numeroDe.get(a.unidadId) ?? "").localeCompare(numeroDe.get(b.unidadId) ?? "", "es", { numeric: true }));
  }
  const totalLineas = lineas.reduce((s, l) => s + l.total, 0);
  const totalSaldo = lineas.reduce((s, l) => s + (l.saldo ?? 0), 0);

  // Fecha sugerida para gastos: hoy si cae dentro del período, si no el último día del período.
  const hoy = hoyISO();
  const prefijo = `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}`;
  const fechaGasto = hoy.startsWith(prefijo)
    ? hoy
    : new Date(Date.UTC(periodo.anio, periodo.mes, 0)).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        titulo={`${condominio.nombre} · ${nombre}`}
        descripcion={
          abierto
            ? "Período abierto: registra los gastos del mes y ciérralo para emitir los cobros."
            : `Cerrado. Los cobros vencen el ${formatoFecha(periodo.vencimiento!)}.`
        }
      />
      <NavCondominio id={id} actual="/periodos" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-gray-600">Gastos comunes</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(totalComun)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">Cargos individuales</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(totalIndividual)}</p>
        </Card>
        <Card>
          <p className="text-sm text-gray-600">{abierto ? "Se cobrará en total" : "Por cobrar"}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{$(abierto ? totalLineas : totalSaldo)}</p>
          <p className="mt-1 text-xs text-gray-500">
            {abierto
              ? `Incluye fondo de reserva de ${condominio.porcentajeReserva.toString()} %`
              : `de ${$(totalLineas)} emitido`}
          </p>
        </Card>
      </div>

      {abierto && editable && (
        <Card className="mb-6">
          <h2 className="mb-4 font-medium">Registrar gasto</h2>
          <GastoForm accion={agregarGasto.bind(null, periodoId)} unidades={unidades} fecha={fechaGasto} />
        </Card>
      )}

      <h2 className="mb-3 font-medium">Gastos del mes</h2>
      {periodo.gastos.length === 0 ? (
        <Vacio>Sin gastos registrados.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Aplica a</th>
              <th className="text-right">Monto</th>
              {abierto && editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {periodo.gastos.map((g) => (
              <tr key={g.id}>
                <td className="whitespace-nowrap">{formatoFecha(g.fecha)}</td>
                <td>{g.categoria}</td>
                <td>
                  {g.descripcion}
                  {(g.proveedor || g.documento) && (
                    <span className="block text-xs text-gray-500">
                      {[g.proveedor, g.documento && `doc. ${g.documento}`].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td>{g.tipo === "COMUN" ? "Todos" : `Unidad ${g.unidad?.numero}`}</td>
                <td className="text-right tabular-nums">{$(g.monto)}</td>
                {abierto && editable && (
                  <td className="text-right">
                    <form action={eliminarGasto.bind(null, g.id)}>
                      <button className="text-sm text-red-700 hover:underline">Quitar</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-medium">{abierto ? "Vista previa de los cobros" : "Avisos de cobro emitidos"}</h2>
        {abierto && editable && !errorPrevia && <CerrarForm accion={cerrarPeriodo.bind(null, periodoId)} periodo={nombre} />}
      </div>
      {errorPrevia ? (
        <Vacio>
          No se puede calcular el cobro: {errorPrevia}{" "}
          <Link href={`/condominios/${id}`} className="text-blue-700 hover:underline">
            Revisar unidades
          </Link>
        </Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Unidad</th>
              <th className="text-right">Gasto común</th>
              <th className="text-right">Fondo reserva</th>
              <th className="text-right">Cargos</th>
              <th className="text-right">Interés mora</th>
              <th className="text-right">Total</th>
              {!abierto && <th className="text-right">Saldo</th>}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.unidadId}>
                <td className="font-medium">{numeroDe.get(l.unidadId)}</td>
                <td className="text-right tabular-nums">{$(l.gastoComun)}</td>
                <td className="text-right tabular-nums">{$(l.fondoReserva)}</td>
                <td className="text-right tabular-nums">{l.cargos ? $(l.cargos) : "—"}</td>
                <td className="text-right tabular-nums">{l.interes ? $(l.interes) : "—"}</td>
                <td className="text-right font-medium tabular-nums">{$(l.total)}</td>
                {!abierto && (
                  <td className={`text-right tabular-nums ${l.saldo ? "text-amber-700" : "text-green-700"}`}>
                    {l.saldo ? $(l.saldo) : "Pagado"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
