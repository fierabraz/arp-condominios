import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { condominiosPermitidos, esPrincipal, filtroCondominios, filtroPersonas, filtroPorCondominio } from "@/lib/permisos";
import { Card, PageHeader, Vacio } from "@/components/ui";
import { TarjetaPropiedad } from "@/components/tarjeta-propiedad";
import { BotonNuevaComunidad } from "@/components/cupo-comunidades";
import { cupoDe } from "@/lib/planes-servicio";
import { resumenPropiedades } from "@/lib/resumen-propiedades";
import { formatoMoneda } from "@/lib/formato";

export default async function InicioPage() {
  const usuario = await requireUsuario();
  if (usuario.rol === "SUPERADMIN") redirect("/plataforma");
  if (usuario.rol === "RESIDENTE") redirect("/mi-cuenta");
  if (usuario.rol === "COMITE") redirect(`/condominios/${usuario.condominioId}`);

  const administradoraId = usuario.administradoraId!;
  const ahora = new Date();
  const principal = esPrincipal(usuario);
  // PLA-002: cupo de comunidades del plan (solo lo necesita quien puede crear).
  const cupo = principal ? await cupoDe(administradoraId) : null;
  const [propiedades, condominios, unidades, personas, porCobrar, vencido] = await Promise.all([
    resumenPropiedades(administradoraId, condominiosPermitidos(usuario) ?? undefined),
    db.condominio.count({ where: { administradoraId, ...filtroCondominios(usuario) } }),
    db.unidad.count({ where: { administradoraId, ...filtroPorCondominio(usuario) } }),
    db.persona.count({ where: { administradoraId, ...filtroPersonas(usuario) } }),
    db.avisoCobro.aggregate({ where: { administradoraId, saldo: { gt: 0 }, unidad: filtroPorCondominio(usuario) }, _sum: { saldo: true } }),
    db.avisoCobro.aggregate({
      where: { administradoraId, saldo: { gt: 0 }, vencimiento: { lt: ahora }, unidad: filtroPorCondominio(usuario) },
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
            <Card className="transition hover:border-marca">
              <p className="text-sm text-texto-suave">{t.titulo}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{t.valor}</p>
            </Card>
          </Link>
        ))}
      </div>

      <section aria-labelledby="mis-propiedades" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="mis-propiedades" className="text-xl font-bold text-convive-oscuro">
            {principal ? "Mis propiedades" : "Propiedades asignadas"}
          </h2>
          {principal && <BotonNuevaComunidad cupo={cupo!} />}
        </div>
        {propiedades.length === 0 ? (
          <Vacio>
            {principal
              ? "Aún no tienes propiedades. Crea la primera para empezar."
              : "Aún no tienes propiedades asignadas. Pide al administrador principal que te asigne en Permisos."}
          </Vacio>
        ) : (
          <div className="overflow-hidden rounded-xl border border-borde shadow-sm">
            {propiedades.map((p) => (
              <TarjetaPropiedad key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
