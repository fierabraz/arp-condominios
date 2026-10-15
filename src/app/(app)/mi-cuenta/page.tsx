import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { ETIQUETAS_TIPO_UNIDAD, formatoPorcentaje } from "@/lib/formato";

export default async function MiCuentaPage() {
  const usuario = await requireUsuario(["RESIDENTE"]);
  const vinculos = usuario.personaId
    ? await db.unidadPersona.findMany({
        where: { personaId: usuario.personaId },
        include: { unidad: { include: { condominio: { select: { nombre: true, direccion: true } } } } },
      })
    : [];

  return (
    <>
      <PageHeader titulo="Mi cuenta" descripcion={`Hola, ${usuario.nombre}`} />
      {vinculos.length === 0 ? (
        <Vacio>Tu cuenta aún no está vinculada a ninguna unidad. Contacta a tu administración.</Vacio>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {vinculos.map((v) => (
            <Card key={`${v.unidadId}-${v.relacion}`}>
              <p className="text-sm text-gray-600">{v.unidad.condominio.nombre}</p>
              <p className="mt-1 text-xl font-semibold">
                {ETIQUETAS_TIPO_UNIDAD[v.unidad.tipo]} {v.unidad.numero}
              </p>
              <p className="mt-2 text-sm text-gray-600">
                {v.relacion === "PROPIETARIO" ? "Propietario" : "Residente"} · alícuota{" "}
                {formatoPorcentaje(v.unidad.alicuota)}
              </p>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-8 text-sm text-gray-500">Pronto verás aquí tus avisos de cobro, pagos y saldo.</p>
    </>
  );
}
