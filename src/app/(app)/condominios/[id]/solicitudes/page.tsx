import { notFound } from "next/navigation";
import { Info, KeyRound } from "lucide-react";
import { Boton, Card, Insignia, PageHeader, Vacio } from "@/components/ui";
import { correoConfigurado } from "@/lib/correo";
import { coincideUnidad, RELACIONES } from "@/lib/cuentas-reglas";
import { db } from "@/lib/db";
import { ETIQUETAS_TIPO_UNIDAD, formatoFechaHora } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { origenDelSitio } from "@/lib/sitio";
import { condominioVisible } from "../condominio-actual";
import { aprobar, cambiarCodigoComunidad, enlaceConfirmacion, rechazar } from "../../solicitudes-actions";
import { AprobarForm, CopiarTexto, EnlaceConfirmacion, RechazarForm } from "./formularios";

// PILOTO-001: solicitudes de residentes para vincularse con una unidad, y el código de la comunidad.
export default async function SolicitudesPage({ params }: PageProps<"/condominios/[id]/solicitudes">) {
  const { id } = await params;
  const { usuario, condominio, administradoraId } = await condominioVisible(id);
  if (!puede(usuario, "solicitudes.revisar", id)) notFound();

  const [pendientes, revisadas, unidades] = await Promise.all([
    db.solicitudVinculo.findMany({
      where: { condominioId: id, administradoraId, estado: "PENDIENTE" },
      orderBy: { creadoEn: "asc" },
      include: {
        usuario: {
          select: { nombre: true, correo: true, telefono: true, correoVerificadoEn: true, persona: { select: { id: true, nombre: true } } },
        },
      },
    }),
    db.solicitudVinculo.findMany({
      where: { condominioId: id, administradoraId, estado: { not: "PENDIENTE" } },
      orderBy: { revisadoEn: "desc" },
      take: 15,
      include: { usuario: { select: { nombre: true } }, unidad: { select: { numero: true } } },
    }),
    db.unidad.findMany({
      where: { condominioId: id, administradoraId },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        tipo: true,
        vinculos: { where: { hasta: null }, select: { persona: { select: { id: true, nombre: true, correo: true, usuario: { select: { id: true } } } } } },
      },
    }),
  ]);

  // Fichas con el mismo correo (por ejemplo, cargadas desde Excel) para no duplicar a la persona.
  const correos = pendientes.map((p) => p.usuario.correo);
  const mismoCorreo = correos.length
    ? await db.persona.findMany({
        where: { administradoraId, OR: correos.map((c) => ({ correo: { equals: c, mode: "insensitive" as const } })) },
        select: { id: true, nombre: true, correo: true, usuario: { select: { id: true } } },
      })
    : [];

  const enlace = condominio.codigoIncorporacion
    ? `${await origenDelSitio()}/crear-cuenta/residente?comunidad=${condominio.codigoIncorporacion}`
    : null;
  const opcionesUnidad = unidades.map((u) => ({
    id: u.id,
    texto: `${ETIQUETAS_TIPO_UNIDAD[u.tipo]} ${u.numero}${u.vinculos.length ? ` · ${[...new Set(u.vinculos.map((v) => v.persona.nombre))].join(", ")}` : ""}`,
  }));

  return (
    <>
      <PageHeader
        titulo="Solicitudes de residentes"
        descripcion={`${condominio.nombre} · Personas que crearon su cuenta y piden acceso a una unidad. Nadie ve la información de una unidad hasta que tú lo apruebas.`}
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-convive-suave text-convive-oscuro">
            <KeyRound size={24} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-lg font-bold">Código de la comunidad</h2>
            {condominio.codigoIncorporacion ? (
              <>
                <p className="font-mono text-2xl font-bold tracking-widest text-convive-oscuro">{condominio.codigoIncorporacion}</p>
                <p className="text-sm text-texto-suave">
                  Compártelo con los residentes (diario mural, aviso de cobro, WhatsApp). Con él crean su cuenta y piden acceso a su
                  unidad; tú apruebas cada solicitud. Si se filtra a quien no corresponde, cámbialo: el anterior deja de servir.
                </p>
                <p className="break-all text-sm">
                  Enlace directo: <span className="font-mono">{enlace}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopiarTexto texto={enlace!} etiqueta="Copiar enlace" />
                  <form action={cambiarCodigoComunidad.bind(null, id)}>
                    <Boton type="submit" variante="secundario">
                      Cambiar código
                    </Boton>
                  </form>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-texto-suave">
                  Genera un código para que los residentes creen su cuenta y pidan acceso a su unidad. También puedes invitarlos
                  uno por uno desde Invitar residentes.
                </p>
                <form action={cambiarCodigoComunidad.bind(null, id)}>
                  <Boton type="submit">Generar código</Boton>
                </form>
              </>
            )}
          </div>
        </div>
      </Card>

      {!correoConfigurado() && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-alerta-suave bg-alerta-suave p-4 text-sm text-alerta">
          <Info size={20} className="shrink-0" aria-hidden="true" />
          <p>
            El envío de correos todavía no está activo: los residentes no reciben el correo para confirmar su cuenta. En cada
            solicitud sin confirmar puedes obtener su enlace y mandárselo por WhatsApp.
          </p>
        </div>
      )}

      <h2 className="mb-3 text-lg font-bold">Por revisar ({pendientes.length})</h2>
      {pendientes.length === 0 ? (
        <Vacio>No hay solicitudes pendientes.</Vacio>
      ) : (
        <ul className="space-y-4">
          {pendientes.map((s) => {
            const sugerida = unidades.find((u) => coincideUnidad(s.unidadTexto, u.numero)) ?? null;
            const fichas = new Map<string, { id: string; texto: string; motivo: string }>();
            for (const p of mismoCorreo) {
              if (p.correo?.toLowerCase() === s.usuario.correo.toLowerCase() && !p.usuario) {
                fichas.set(p.id, { id: p.id, texto: p.nombre, motivo: "tiene el mismo correo" });
              }
            }
            for (const v of sugerida?.vinculos ?? []) {
              if (!v.persona.usuario && !fichas.has(v.persona.id)) {
                fichas.set(v.persona.id, { id: v.persona.id, texto: v.persona.nombre, motivo: `registrada en la unidad ${sugerida!.numero}, sin cuenta` });
              }
            }
            const verificado = !!s.usuario.correoVerificadoEn;
            return (
              <li key={s.id}>
                <Card>
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">{s.usuario.nombre}</p>
                      <p className="text-sm text-texto-suave">
                        {s.usuario.correo}
                        {s.usuario.telefono ? ` · ${s.usuario.telefono}` : ""} · enviada el {formatoFechaHora(s.creadoEn)}
                      </p>
                      <p className="mt-2 text-sm">
                        Dice ser <strong>{RELACIONES[s.relacion].texto.toLowerCase()}</strong> de <strong>{s.unidadTexto}</strong>
                        {sugerida ? "" : " (no encontramos una unidad con ese número: elígela tú)"}.
                      </p>
                      {s.mensaje && <p className="mt-1 text-sm italic">“{s.mensaje}”</p>}
                    </div>
                    <Insignia tono={verificado ? "exito" : "alerta"}>{verificado ? "Correo confirmado" : "Correo sin confirmar"}</Insignia>
                  </div>
                  {verificado ? (
                    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                      <AprobarForm
                        accion={aprobar.bind(null, id, s.id)}
                        unidades={opcionesUnidad}
                        unidadSugerida={sugerida?.id ?? null}
                        fichas={[...fichas.values()]}
                        fichaFija={s.usuario.persona ? { id: s.usuario.persona.id, texto: s.usuario.persona.nombre } : null}
                        relacion={s.relacion}
                      />
                      <RechazarForm accion={rechazar.bind(null, id, s.id)} />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-texto-suave">
                        Podrás aprobarla cuando confirme su correo. Así sabemos que el correo es suyo.
                      </p>
                      <div className="flex flex-wrap items-start gap-3">
                        <EnlaceConfirmacion generar={enlaceConfirmacion.bind(null, s.id)} />
                        <RechazarForm accion={rechazar.bind(null, id, s.id)} />
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {revisadas.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-lg font-bold">Revisadas recientemente</h2>
          <ul className="space-y-2 text-sm">
            {revisadas.map((s) => (
              <li key={s.id} className="rounded-xl border border-borde bg-white px-4 py-3">
                <strong>{s.usuario.nombre}</strong> · {s.unidad?.numero ?? s.unidadTexto} ·{" "}
                {s.estado === "APROBADA" ? "aprobada" : s.estado === "RECHAZADA" ? `rechazada (${s.motivo})` : "cancelada por la persona"}
                {s.revisadoPorNombre && s.estado !== "CANCELADA" ? ` por ${s.revisadoPorNombre}` : ""}
                {s.revisadoEn ? `, ${formatoFechaHora(s.revisadoEn)}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
