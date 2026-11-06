import writeXlsxFile from "write-excel-file/node";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { COLUMNAS_DEUDA, CONCEPTOS } from "@/lib/apertura";

/** COM-001 · Entrega 5: planilla vacía de deudas de apertura, con instrucciones y la lista de unidades. */
export async function GET(_: Request, { params }: RouteContext<"/condominios/[id]/apertura/plantilla">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) return new Response("Propiedad no encontrada", { status: 404 });
  const condominio = await db.condominio.findFirst({
    where: { id, administradoraId },
    select: { nombre: true, apertura: { select: { fechaCorte: true } }, unidades: { select: { numero: true }, orderBy: { numero: "asc" } } },
  });
  if (!condominio) return new Response("Propiedad no encontrada", { status: 404 });
  const corte = condominio.apertura?.fechaCorte.toISOString().slice(0, 10).split("-").reverse().join("-");
  const negrita = (value: string) => ({ value, fontWeight: "bold" as const });

  const buffer = await writeXlsxFile([
    {
      sheet: "Deudas",
      data: [COLUMNAS_DEUDA.map((c) => ({ ...negrita(c.titulo), backgroundColor: "#E3F2EE" }))],
      columns: [{ width: 12 }, { width: 14 }, { width: 18 }, { width: 15 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 30 }],
      stickyRowsCount: 1,
    },
    {
      sheet: "Instrucciones",
      data: [
        [negrita("Columna"), negrita("Qué poner")],
        ...COLUMNAS_DEUDA.map((c) => [{ value: c.titulo }, { value: c.ayuda }]),
        [],
        [negrita("Reglas"), null],
        [{ value: "•" }, { value: `Solo deudas hasta la fecha de corte${corte ? ` (${corte})` : ""}. Lo posterior lo cobra Convive.` }],
        [{ value: "•" }, { value: "Una fila por unidad, mes y concepto. Ejemplo: A-305 debe septiembre, octubre y noviembre → tres filas, no una de 212.000." }],
        [{ value: "•" }, { value: "No agregues filas de Total, Subtotal ni Saldo anterior: Convive suma solo." }],
        [{ value: "•" }, { value: "Los intereses ya calculados por el sistema anterior van en su propia fila con concepto Interés. Convive no calcula intereses sobre estas deudas por ahora." }],
        [{ value: "•" }, { value: "Montos en pesos, sin decimales. Si pones monto original y abonos, el saldo debe ser la resta." }],
        [{ value: "•" }, { value: `Conceptos sugeridos: ${CONCEPTOS.join(", ")}.` }],
        [{ value: "•" }, { value: "Si una fila tiene un error no se carga nada; volver a subir la misma planilla no duplica deudas." }],
      ],
      columns: [{ width: 16 }, { width: 110 }],
    },
    { sheet: "Unidades", data: [[negrita("Unidades de la propiedad")], ...condominio.unidades.map((u) => [{ value: u.numero }])], columns: [{ width: 26 }] },
  ]).toBuffer();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="deudas-de-apertura.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
