import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { correoConfigurado } from "@/lib/correo";
import { estadoCodigo } from "@/lib/cuentas-reglas";
import { formatoFechaHora } from "@/lib/formato";
import { anularCodigo, crearCodigo, enlaceVerificacionPlataforma } from "./actions";
import { CodigoForm, EnlaceVerificacion } from "./formularios";

const TEXTO_ESTADO = {
  VALIDO: { texto: "Vigente", tono: "exito" },
  VENCIDO: { texto: "Vencido", tono: "neutro" },
  AGOTADO: { texto: "Usado", tono: "marca" },
  ANULADO: { texto: "Anulado", tono: "peligro" },
  OTRO_CORREO: { texto: "Vigente", tono: "exito" },
} as const;

// PILOTO-001: códigos para que administradores autorizados creen su cuenta, y cuentas por confirmar.
export default async function CodigosPage() {
  await requirePermiso("plataforma");
  const [codigos, sinConfirmar] = await Promise.all([
    db.codigoRegistro.findMany({
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: { usuarios: { select: { nombre: true, correo: true, correoVerificadoEn: true, administradora: { select: { nombre: true } } } } },
    }),
    db.usuario.findMany({
      where: { correoVerificadoEn: null, activo: true, claveActualizadaEn: null, rol: { not: "SUPERADMIN" }, tokensRecuperacion: { none: { tipo: "INVITACION" } } },
      orderBy: { creadoEn: "desc" },
      take: 50,
      select: { id: true, nombre: true, correo: true, rol: true, creadoEn: true },
    }),
  ]);
  const ahora = new Date();
  return (
    <>
      <PageHeader
        titulo="Códigos de acceso"
        descripcion="Durante el piloto, solo quien recibe un código puede crear una cuenta de administración. Cada cuenta nueva parte con una administración vacía y propia: no ve comunidades de otros."
      />
      <Card className="mb-6">
        <h2 className="mb-4 text-lg font-bold">Nuevo código</h2>
        <CodigoForm accion={crearCodigo} />
      </Card>

      <h2 className="mb-3 text-lg font-bold">Códigos creados</h2>
      {codigos.length === 0 ? (
        <Vacio>Aún no hay códigos.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Para</th>
              <th>Estado</th>
              <th>Usos</th>
              <th>Vence</th>
              <th>Cuentas creadas</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {codigos.map((c) => {
              const e = TEXTO_ESTADO[estadoCodigo(c, null, ahora)];
              return (
                <tr key={c.id}>
                  <td>
                    <span className="font-medium">{c.etiqueta}</span>
                    {c.correo && <span className="block text-texto-suave">{c.correo}</span>}
                  </td>
                  <td>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                  </td>
                  <td>
                    {c.usos} de {c.usosMaximos}
                  </td>
                  <td>{formatoFechaHora(c.expiraEn)}</td>
                  <td className="text-texto-suave">
                    {c.usuarios.length === 0
                      ? "—"
                      : c.usuarios.map((u) => `${u.nombre} (${u.administradora?.nombre ?? "sin administración"})${u.correoVerificadoEn ? "" : ", sin confirmar"}`).join("; ")}
                  </td>
                  <td className="text-right">
                    {!c.anuladoEn && estadoCodigo(c, null, ahora) === "VALIDO" && (
                      <form action={anularCodigo.bind(null, c.id)}>
                        <button className="min-h-11 text-sm text-peligro hover:underline">Anular</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}

      <h2 className="mt-8 mb-1 text-lg font-bold">Cuentas que aún no confirman su correo</h2>
      <p className="mb-3 text-sm text-texto-suave">
        {correoConfigurado()
          ? "Ya se les envió el correo de confirmación. Si no les llegó, puedes obtener su enlace y entregárselo solo a esa persona."
          : "El envío de correos no está activo, así que no reciben el enlace de confirmación. Obténlo aquí y entrégaselo solo a esa persona (por ejemplo, por WhatsApp)."}
      </p>
      {sinConfirmar.length === 0 ? (
        <Vacio>No hay cuentas pendientes de confirmar.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Creada</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sinConfirmar.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="font-medium">{u.nombre}</span>
                  <span className="block text-texto-suave">{u.correo}</span>
                </td>
                <td>{u.rol === "RESIDENTE" ? "Residente" : "Administración"}</td>
                <td>{formatoFechaHora(u.creadoEn)}</td>
                <td className="min-w-64">
                  <EnlaceVerificacion generar={enlaceVerificacionPlataforma.bind(null, u.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
