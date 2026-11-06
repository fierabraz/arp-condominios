import writeXlsxFile from "write-excel-file/node";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { ETIQUETAS_TIPO_UNIDAD } from "@/lib/formato";
import { COLUMNAS } from "@/lib/importacion";
import { ORDEN_TIPOS, TIPOS_VINCULO } from "@/lib/vinculos";

/**
 * Planilla para la carga desde Excel. Trae lo que la propiedad ya tiene (una fila por persona
 * y unidad), así sirve tanto para cargar desde cero como para corregir y volver a subir.
 */
export async function GET(_: Request, { params }: RouteContext<"/condominios/[id]/importar/plantilla">) {
  const { id } = await params;
  const { usuario, administradoraId } = await requireAdministradora();
  if (!puedeVerPropiedad(usuario, id)) return new Response("Propiedad no encontrada", { status: 404 });
  const condominio = await db.condominio.findFirst({
    where: { id, administradoraId },
    include: {
      unidades: {
        orderBy: { numero: "asc" },
        // COM-001: los vínculos vigentes (con su tipo y fecha de inicio), no solo propietario o residente.
        include: { vinculos: { where: { hasta: null }, include: { persona: true }, orderBy: { creadoEn: "asc" } } },
      },
    },
  });
  if (!condominio) return new Response("Propiedad no encontrada", { status: 404 });

  const titulos = COLUMNAS.map((c) => ({ value: c.titulo, fontWeight: "bold" as const, backgroundColor: "#E3F2EE" }));
  const filas: (string | number | null)[][] = [];
  for (const u of condominio.unidades) {
    const base = [u.numero, ETIQUETAS_TIPO_UNIDAD[u.tipo], Number(u.alicuota)];
    // Los vínculos de una persona con la misma fecha van en una fila: "Propietario y residente".
    const grupos = new Map<string, { p: (typeof u.vinculos)[number]["persona"]; tipos: (typeof u.vinculos)[number]["tipo"][]; desde: Date | null }>();
    for (const v of u.vinculos) {
      const llave = `${v.personaId}|${v.desde?.toISOString() ?? ""}`;
      const ya = grupos.get(llave) ?? { p: v.persona, tipos: [], desde: v.desde };
      ya.tipos.push(v.tipo);
      grupos.set(llave, ya);
    }
    if (grupos.size === 0) filas.push([...base, null, null, null, null, null, null]);
    for (const { p, tipos, desde } of grupos.values()) {
      const texto = ORDEN_TIPOS.filter((t) => tipos.includes(t))
        .map((t, i) => (i === 0 ? TIPOS_VINCULO[t].texto : TIPOS_VINCULO[t].texto.toLowerCase()))
        .join(" y ");
      const fecha = desde ? desde.toISOString().slice(0, 10).split("-").reverse().join("-") : null;
      filas.push([...base, p.nombre, p.documento, p.correo, p.telefono, texto, fecha]);
    }
  }

  const ayuda = [
    [
      { value: "Columna", fontWeight: "bold" as const },
      { value: "Qué poner", fontWeight: "bold" as const },
    ],
    ...COLUMNAS.map((c) => [{ value: c.titulo }, { value: c.ayuda }]),
    [],
    [{ value: "Consejos", fontWeight: "bold" as const }, null],
    [{ value: "•" }, { value: "Una fila por persona y unidad. Si una unidad tiene dueño y arrendatario, van en dos filas con el mismo número de unidad." }],
    [{ value: "•" }, { value: "Una unidad tiene un solo propietario; si hay más dueños, los demás van como copropietarios. Un dueño no puede ser arrendatario de su unidad." }],
    [{ value: "•" }, { value: "El ocupante queda registrado, pero no recibe acceso a la app ni cobros." }],
    [{ value: "•" }, { value: "Para terminar un vínculo (por ejemplo, un arrendatario que se fue) hazlo en la ficha de la unidad: la planilla solo agrega." }],
    [{ value: "•" }, { value: "Una unidad sin nombre de persona se carga sola (útil para bodegas y estacionamientos)." }],
    [{ value: "•" }, { value: "Si la unidad ya existe, se actualizan su tipo y alícuota. A las personas ya registradas (mismo RUT o correo) solo se les agregan los datos que les falten." }],
    [{ value: "•" }, { value: "Nada se borra: quitar una fila de la planilla no elimina la unidad ni la persona." }],
    [{ value: "•" }, { value: "Antes de guardar verás una revisión con todo lo que se va a cargar." }],
  ];

  const buffer = await writeXlsxFile([
    {
      sheet: "Unidades",
      data: [titulos, ...filas.map((f) => f.map((value) => (value === null ? null : { value })))],
      columns: [{ width: 12 }, { width: 16 }, { width: 13 }, { width: 30 }, { width: 14 }, { width: 28 }, { width: 16 }, { width: 26 }, { width: 12 }],
      stickyRowsCount: 1,
    },
    { sheet: "Instrucciones", data: ayuda, columns: [{ width: 16 }, { width: 110 }] },
  ]).toBuffer();

  const nombre = `planilla-${condominio.nombre.normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
