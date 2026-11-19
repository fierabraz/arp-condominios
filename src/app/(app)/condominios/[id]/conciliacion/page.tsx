import Link from "next/link";
import { Landmark, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { BotonLink, Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { CargaCartola } from "@/components/carga-cartola";
import { ESTADOS_CONCILIACION, TIPOS_CUENTA, type EstadoConciliacion } from "@/lib/cartolas";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { filtroCondominios, puede } from "@/lib/permisos";
import { BotonAccion } from "../estructura/formularios";
import { condominioVisible } from "../condominio-actual";
import { confirmarCartolaAccion, crearCuenta, eliminarCuenta, revisarCartolaAccion } from "../../conciliacion-actions";
import { ElegirComunidad, FormularioCuenta } from "./formularios";

// FIN-003.1 · Finanzas → Conciliación bancaria: cuentas de la comunidad, carga de cartolas,
// estado de los movimientos e historial de importaciones.

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("-") : "—");

export default async function ConciliacionPage({ params, searchParams }: PageProps<"/condominios/[id]/conciliacion">) {
  const { id } = await params;
  const sp = await searchParams;
  const { condominio, usuario, administradoraId, moneda } = await condominioVisible(id);
  const editable = puede(usuario, "banco.importar", id);
  const base = `/condominios/${id}/conciliacion`;

  const [comunidades, cuentas, apertura] = await Promise.all([
    db.condominio.findMany({ where: { administradoraId, ...filtroCondominios(usuario) }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.cuentaBancaria.findMany({
      where: { condominioId: id, administradoraId },
      orderBy: { creadoEn: "asc" },
      include: { _count: { select: { movimientos: true, importaciones: true } } },
    }),
    // COM-001 · apertura: si ya se anotaron cuentas ahí, se proponen para no escribirlas de nuevo.
    editable ? db.apertura.findUnique({ where: { condominioId: id }, select: { cuentas: { select: { banco: true, tipo: true, numeroFinal: true } } } }) : null,
  ]);
  const sugeridas = (apertura?.cuentas ?? []).filter(
    (c) => c.tipo !== "CAJA" && c.numeroFinal && /^\d{4}$/.test(c.numeroFinal) && !cuentas.some((x) => x.banco === c.banco && x.numeroFinal === c.numeroFinal),
  );
  const cuenta = cuentas.find((c) => c.id === sp.cuenta) ?? (cuentas.length === 1 ? cuentas[0] : undefined);

  const encabezado = (
    <PageHeader
      titulo="Conciliación bancaria"
      descripcion={`${condominio.nombre} · Cuentas bancarias, carga de cartolas y movimientos.`}
      acciones={
        <>
          {cuenta && (
            <BotonLink href={`${base}/movimientos?cuenta=${cuenta.id}`} variante="secundario">
              Ver movimientos
            </BotonLink>
          )}
          {editable && (
            <BotonLink href={`${base}/perfiles`} variante="secundario">
              Perfiles de cartola
            </BotonLink>
          )}
        </>
      }
    />
  );

  const formularioCuenta = editable && (
    <FormularioCuenta
      accion={crearCuenta.bind(null, id)}
      sugerida={sugeridas[0] ? { banco: sugeridas[0].banco, tipo: sugeridas[0].tipo, numeroFinal: sugeridas[0].numeroFinal! } : undefined}
    />
  );

  return (
    <>
      {encabezado}
      <div className="mb-6">
        <ElegirComunidad actual={id} comunidades={comunidades} />
      </div>

      {cuentas.length === 0 ? (
        <Card className="mb-6">
          <h2 className="mb-1 text-lg font-bold">Registra la cuenta bancaria de la comunidad</h2>
          <p className="mb-4 text-sm text-texto-suave">
            Cada comunidad tiene sus propias cuentas, cartolas y movimientos.
            {sugeridas.length > 0 && " Te proponemos la cuenta que se anotó en la apertura."}
          </p>
          {formularioCuenta || <Vacio>Todavía no hay cuentas bancarias registradas para esta comunidad.</Vacio>}
        </Card>
      ) : (
        <section aria-labelledby="cuentas" className="mb-6">
          <h2 id="cuentas" className="mb-3 text-lg font-bold">
            Cuenta bancaria
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cuentas.map((c) => {
              const elegida = c.id === cuenta?.id;
              return (
                <li key={c.id}>
                  <Link
                    href={`${base}?cuenta=${c.id}`}
                    aria-current={elegida ? "true" : undefined}
                    className={`flex h-full items-start gap-3 rounded-2xl border p-4 transition ${elegida ? "border-marca bg-marca-suave ring-2 ring-convive/30" : "border-borde bg-white hover:border-convive"}`}
                  >
                    <Landmark size={24} className="mt-0.5 shrink-0 text-marca" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {c.banco} ···{c.numeroFinal}
                      </span>
                      <span className="block text-sm text-texto-suave">
                        {TIPOS_CUENTA[c.tipo as keyof typeof TIPOS_CUENTA] ?? c.tipo}
                        {c.alias && ` · ${c.alias}`}
                      </span>
                      <span className="block text-sm text-texto-suave">
                        {c._count.movimientos} movimientos · {c._count.importaciones} cartolas
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {editable && (
            <details className="mt-3 rounded-2xl border border-borde bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-marca">Registrar otra cuenta</summary>
              <div className="mt-4">{formularioCuenta}</div>
            </details>
          )}
        </section>
      )}

      {cuentas.length > 1 && !cuenta && <Vacio>Elige una cuenta para cargar cartolas y ver sus movimientos.</Vacio>}
      {cuenta && <DetalleCuenta cuenta={cuenta} condominioId={id} editable={editable} moneda={moneda} base={base} />}
    </>
  );
}

async function DetalleCuenta({
  cuenta,
  condominioId,
  editable,
  moneda,
  base,
}: {
  cuenta: { id: string; banco: string; numeroFinal: string; _count: { importaciones: number } };
  condominioId: string;
  editable: boolean;
  moneda: string;
  base: string;
}) {
  const [porEstado, importaciones, ultimo] = await Promise.all([
    db.movimientoBancario.groupBy({ by: ["estado"], where: { cuentaId: cuenta.id, condominioId }, _count: true, _sum: { monto: true } }),
    db.importacionCartola.findMany({ where: { cuentaId: cuenta.id, condominioId }, orderBy: { creadoEn: "desc" }, take: 20 }),
    db.movimientoBancario.findFirst({ where: { cuentaId: cuenta.id, condominioId, saldo: { not: null } }, orderBy: [{ fecha: "desc" }, { fila: "asc" }], select: { fecha: true, saldo: true } }),
  ]);
  const conteo = (e: EstadoConciliacion) => porEstado.find((p) => p.estado === e)?._count ?? 0;

  return (
    <div className="space-y-6">
      {editable && (
        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Cargar cartola</h2>
              <p className="text-sm text-texto-suave">
                {cuenta.banco} ···{cuenta.numeroFinal}. Antes de guardar verás qué movimientos son nuevos, cuáles ya estaban y cuáles revisar.
              </p>
            </div>
            {cuenta._count.importaciones === 0 && (
              <BotonAccion accion={eliminarCuenta.bind(null, condominioId, cuenta.id)} pregunta={`¿Quitar la cuenta ${cuenta.banco} ···${cuenta.numeroFinal}? Todavía no tiene cartolas.`}>
                Quitar cuenta
              </BotonAccion>
            )}
          </div>
          <CargaCartola
            revisar={revisarCartolaAccion.bind(null, condominioId, cuenta.id)}
            confirmar={confirmarCartolaAccion.bind(null, condominioId, cuenta.id)}
            banco={cuenta.banco}
            base={base}
            moneda={moneda}
          />
          <p className="mt-4 flex items-start gap-2 text-xs text-texto-suave">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-marca" aria-hidden="true" />
            <span>
              El archivo no se guarda: Convive lee solo los valores de las celdas (no ejecuta fórmulas, macros ni conexiones) y conserva su
              huella digital para demostrar de qué archivo salió cada movimiento. Nada se envía a otros servicios.
            </span>
          </p>
        </Card>
      )}

      <section aria-labelledby="estados">
        <h2 id="estados" className="mb-3 text-lg font-bold">
          Movimientos de la cuenta
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(Object.keys(ESTADOS_CONCILIACION) as EstadoConciliacion[]).map((e) => (
            <li key={e}>
              <Link href={`${base}/movimientos?cuenta=${cuenta.id}&estado=${e}`} className="block rounded-xl border border-borde bg-white p-3 hover:border-convive">
                <span className="block text-xs text-texto-suave">{ESTADOS_CONCILIACION[e].texto}</span>
                <span className="text-2xl font-bold text-convive-oscuro">{conteo(e)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {ultimo && (
          <p className="mt-2 text-sm text-texto-suave">
            Último saldo informado por el banco: {formatoMoneda(Number(ultimo.saldo), moneda)} al {dia(ultimo.fecha)}.
          </p>
        )}
        <p className="mt-1 text-sm text-texto-suave">
          En esta primera versión los movimientos se consultan y se marcan para revisión. Relacionarlos con pagos y egresos llega en FIN-003.2.
        </p>
      </section>

      <section aria-labelledby="historial">
        <h2 id="historial" className="mb-3 text-lg font-bold">
          Historial de importaciones
        </h2>
        {importaciones.length === 0 ? (
          <Vacio>Todavía no se ha cargado ninguna cartola en esta cuenta.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th>Cargada</th>
                <th>Archivo</th>
                <th>Período</th>
                <th className="text-right">Nuevos</th>
                <th className="text-right">Ya registrados</th>
                <th className="text-right">Posibles duplicados</th>
                <th className="text-right">Errores</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {importaciones.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">
                    {formatoFechaHora(i.creadoEn)}
                    <span className="block text-xs text-texto-suave">{i.usuarioNombre}</span>
                  </td>
                  <td className="max-w-56 break-all">
                    <Link href={`${base}/importaciones/${i.id}`} className="font-semibold text-marca hover:underline">
                      {i.archivoNombre}
                    </Link>
                    {i.perfilNombre && <span className="block text-xs text-texto-suave">Perfil «{i.perfilNombre}»</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {dia(i.desde)} al {dia(i.hasta)}
                  </td>
                  <td className="text-right">{i.nuevos}</td>
                  <td className="text-right">{i.yaRegistrados}</td>
                  <td className="text-right">
                    {i.posiblesDuplicados}
                    {i.duplicadosOmitidos > 0 && <span className="block text-xs text-texto-suave">{i.duplicadosOmitidos} omitidos</span>}
                  </td>
                  <td className="text-right">{i.errores}</td>
                  <td>
                    <Insignia tono="exito">Aplicada</Insignia>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </section>
    </div>
  );
}
