import Link from "next/link";
import { requireUsuario } from "@/lib/auth";
import { db } from "@/lib/db";
import { Boton, Insignia, Input, PageHeader, Select, Tabla, Vacio } from "@/components/ui";
import { ETIQUETAS_ROL, formatoFechaHora } from "@/lib/formato";
import type { Prisma } from "@/generated/prisma/client";
import type { Rol } from "@/generated/prisma/enums";

const ROLES = Object.keys(ETIQUETAS_ROL) as Rol[];
const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

export default async function UsuariosPlataformaPage({ searchParams }: PageProps<"/plataforma/usuarios">) {
  await requireUsuario(["SUPERADMIN"]);
  const sp = await searchParams;
  const q = texto(sp.q);
  const administradora = texto(sp.administradora);
  const rol = ROLES.find((r) => r === texto(sp.rol));
  const estado = texto(sp.estado);

  const where: Prisma.UsuarioWhereInput = {
    ...(q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { correo: { contains: q, mode: "insensitive" } }] } : {}),
    ...(administradora ? { administradoraId: administradora } : {}),
    ...(rol ? { rol } : {}),
    ...(estado === "activas" ? { activo: true } : estado === "desactivadas" ? { activo: false } : {}),
  };
  const [usuarios, administradoras, total] = await Promise.all([
    db.usuario.findMany({
      where,
      orderBy: [{ administradora: { nombre: "asc" } }, { nombre: "asc" }],
      take: 300,
      include: { administradora: { select: { nombre: true } }, condominio: { select: { nombre: true } } },
    }),
    db.administradora.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    db.usuario.count(),
  ]);

  return (
    <>
      <PageHeader titulo="Usuarios" descripcion={`Todas las cuentas de la plataforma (${total}). Toca una para cambiar su contraseña, sus datos o su estado.`} />
      <form action="/plataforma/usuarios" className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-end">
        <label>
          <span className="mb-1 block text-sm font-semibold">Buscar</span>
          <Input name="q" defaultValue={q} placeholder="Nombre o correo" type="search" />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Administradora</span>
          <Select name="administradora" defaultValue={administradora}>
            <option value="">Todas</option>
            {administradoras.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Rol</span>
          <Select name="rol" defaultValue={rol ?? ""}>
            <option value="">Todos</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETAS_ROL[r]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold">Estado</span>
          <Select name="estado" defaultValue={estado}>
            <option value="">Todas</option>
            <option value="activas">Activas</option>
            <option value="desactivadas">Desactivadas</option>
          </Select>
        </label>
        <Boton type="submit" variante="secundario">
          Buscar
        </Boton>
      </form>

      {usuarios.length === 0 ? (
        <Vacio>No hay cuentas que coincidan.</Vacio>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {usuarios.map((u) => (
              <li key={u.id}>
                <Link href={`/plataforma/usuarios/${u.id}`} className="flex flex-col gap-1 rounded-2xl border border-borde bg-white p-4 hover:border-marca">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{u.nombre}</span>
                    {u.activo ? <Insignia tono="exito">Activa</Insignia> : <Insignia tono="peligro">Desactivada</Insignia>}
                  </span>
                  <span className="break-all text-sm">{u.correo}</span>
                  <span className="text-sm text-texto-suave">
                    {ETIQUETAS_ROL[u.rol]} · {u.administradora?.nombre ?? "Plataforma"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Tabla>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Administradora</th>
                  <th>Último ingreso</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/plataforma/usuarios/${u.id}`} className="font-semibold text-marca hover:underline">
                        {u.nombre}
                      </Link>
                    </td>
                    <td className="break-all">{u.correo}</td>
                    <td>
                      {ETIQUETAS_ROL[u.rol]}
                      {u.condominio && <span className="block text-xs text-texto-suave">{u.condominio.nombre}</span>}
                    </td>
                    <td>{u.administradora?.nombre ?? "Plataforma"}</td>
                    <td className="whitespace-nowrap text-texto-suave">{u.ultimoIngresoEn ? formatoFechaHora(u.ultimoIngresoEn) : "—"}</td>
                    <td>{u.activo ? <Insignia tono="exito">Activa</Insignia> : <Insignia tono="peligro">Desactivada</Insignia>}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </div>
        </>
      )}
    </>
  );
}
