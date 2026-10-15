import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";

export default async function InicioPage() {
  const usuario = await requireUsuario();
  if (usuario.rol === "SUPERADMIN") redirect("/plataforma");
  if (usuario.rol === "RESIDENTE") redirect("/mi-cuenta");
  if (usuario.rol === "COMITE") redirect(`/condominios/${usuario.condominioId}`);

  const administradoraId = usuario.administradoraId!;
  const [condominios, unidades, personas] = await Promise.all([
    db.condominio.count({ where: { administradoraId } }),
    db.unidad.count({ where: { administradoraId } }),
    db.persona.count({ where: { administradoraId } }),
  ]);

  const tarjetas = [
    { titulo: "Condominios", valor: condominios, href: "/condominios" },
    { titulo: "Unidades", valor: unidades, href: "/condominios" },
    { titulo: "Personas", valor: personas, href: "/personas" },
  ];

  return (
    <>
      <PageHeader titulo={`Hola, ${usuario.nombre.split(" ")[0]}`} descripcion="Resumen de tu administración" />
      <div className="grid gap-4 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <Link key={t.titulo} href={t.href}>
            <Card className="transition hover:border-blue-300">
              <p className="text-sm text-gray-600">{t.titulo}</p>
              <p className="mt-1 text-3xl font-semibold">{t.valor}</p>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-sm text-gray-500">
        Los gastos, cobros y pagos llegan en el siguiente paso del proyecto.
      </p>
    </>
  );
}
