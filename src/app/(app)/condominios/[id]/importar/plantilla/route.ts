import writeXlsxFile from "write-excel-file/node";
import { puedeVerPropiedad, requireAdministradora } from "@/lib/auth";
import { db } from "@/lib/db";
import { ETIQUETAS_TIPO_UNIDAD } from "@/lib/formato";
import { COLUMNAS } from "@/lib/importacion";

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
        include: { personas: { include: { persona: true }, orderBy: { relacion: "asc" } } },
      },
    },
  });
  if (!condominio) return new Response("Propiedad no encontrada", { status: 404 });

  const titulos = COLUMNAS.map((c) => ({ value: c.titulo, fontWeight: "bold" as const, backgroundColor: "#E3F2EE" }));
  const filas: (string | number | null)[][] = [];
  for (const u of condominio.unidades) {
    const base = [u.numero, ETIQUETAS_TIPO_UNIDAD[u.tipo], Number(u.alicuota)];
    // Una persona que es propietaria y residente de la misma unidad va en una sola fila ("Ambos").
    const porPersona = new Map<string, { p: (typeof u.personas)[number]["persona"]; rel: string[] }>();
    for (const v of u.personas) {
      const ya = porPersona.get(v.personaId) ?? { p: v.persona, rel: [] };
      ya.rel.push(v.relacion === "PROPIETARIO" ? "Propietario" : "Residente");
      porPersona.set(v.personaId, ya);
    }
    if (porPersona.size === 0) filas.push([...base, null, null, null, null, null]);
    for (const { p, rel } of porPersona.values()) {
      filas.push([...base, p.nombre, p.documento, p.correo, p.telefono, rel.length > 1 ? "Ambos" : rel[0]]);
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
    [{ value: "•" }, { value: "Una unidad sin nombre de persona se carga sola (útil para bodegas y estacionamientos)." }],
    [{ value: "•" }, { value: "Si la unidad ya existe, se actualizan su tipo y alícuota. A las personas ya registradas (mismo RUT o correo) solo se les agregan los datos que les falten." }],
    [{ value: "•" }, { value: "Nada se borra: quitar una fila de la planilla no elimina la unidad ni la persona." }],
    [{ value: "•" }, { value: "Antes de guardar verás una revisión con todo lo que se va a cargar." }],
  ];

  const buffer = await writeXlsxFile([
    {
      sheet: "Unidades",
      data: [titulos, ...filas.map((f) => f.map((value) => (value === null ? null : { value })))],
      columns: [{ width: 12 }, { width: 16 }, { width: 13 }, { width: 30 }, { width: 14 }, { width: 28 }, { width: 16 }, { width: 14 }],
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
