import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { formatoMoneda } from "@/lib/formato";

export default async function InicioPage() {
  const usuario = await requireUsuario();
  if (usuario.rol === "SUPERADMIN") redirect("/plataforma");
  if (usuario.rol === "RESIDENTE") redirect("/mi-cuenta");
  if (usuario.rol === "COMITE") redirect(`/condominios/${usuario.condominioId}`);

  const administradoraId = usuario.administradoraId!;
  const ahora = new Date();
  const [condominios, unidades, personas, porCobrar, vencido] = await Promise.all([
    db.condominio.count({ where: { administradoraId } }),
    db.unidad.count({ where: { administradoraId } }),
    db.persona.count({ where: { administradoraId } }),
    db.avisoCobro.aggregate({ where: { administradoraId, saldo: { gt: 0 } }, _sum: { saldo: true } }),
    db.avisoCobro.aggregate({
      where: { administradoraId, saldo: { gt: 0 }, vencimiento: { lt: ahora } },
      _sum: { saldo: true },
    }),
  ]);
  const moneda = usuario.administradora?.moneda ?? "CLP";

  const tarjetas = [
    { titulo: "Propiedades", valor: condominios, href: "/condominios" },
    { titulo: "Unidades", valor: unidades, href: "/condominios" },
    { titulo: "Propietarios y residentes", valor: personas, href: "/personas" },
    { titulo: "Por cobrar", valor: formatoMoneda(porCobrar._sum.saldo ?? 0, moneda), href: "/condominios" },
    { titulo: "Deuda vencida", valor: formatoMoneda(vencido._sum.saldo ?? 0, moneda), href: "/condominios" },
  ];

  return (
    <>
      <PageHeader titulo={`Hola, ${usuario.nombre.split(" ")[0]}`} descripcion="Panel de propiedades: resumen de tu administración" />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tarjetas.map((t) => (
          <Link key={t.titulo} href={t.href}>
            <Card className="transition hover:border-blue-300">
              <p className="text-sm text-gray-600">{t.titulo}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{t.valor}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
