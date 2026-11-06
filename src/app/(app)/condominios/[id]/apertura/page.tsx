import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { diaISO } from "@/lib/forms";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import {
  CONCEPTOS,
  ESTADOS_APERTURA,
  ESTADOS_DEUDA,
  ORDEN_ESTADOS_DEUDA,
  revisarApertura,
  saldoAjustado,
  textoPeriodo,
  TIPOS_CUENTA,
  TIPOS_FONDO,
  TIPOS_OBLIGACION,
  TRAMOS,
  UMBRAL_DIFERENCIA,
} from "@/lib/apertura";
import { datosApertura } from "@/lib/apertura-servicio";
import { condominioVisible } from "../condominio-actual";
import { BotonAccion } from "../estructura/formularios";
import {
  agregarCredito,
  agregarCuenta,
  agregarDeuda,
  agregarFondo,
  agregarObligacion,
  cambiarEstadoApertura,
  confirmarDeudasPlanilla,
  eliminarDeApertura,
  guardarApertura,
  revisarDeudasPlanilla,
  type TablaApertura,
} from "../../apertura-actions";
import { CargaDeudas, FormularioApertura, type CampoForm } from "./formularios";

const opciones = (r: Record<string, string | { texto: string }>) =>
  Object.entries(r).map(([valor, t]) => ({ valor, texto: typeof t === "string" ? t : t.texto }));
const $ = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatoMoneda(n));

export default async function AperturaPage({ params }: PageProps<"/condominios/[id]/apertura">) {
  const { id } = await params;
  const { condominio, editable } = await condominioVisible(id);
  // El detalle de deudas por unidad es solo para administradores (D-COM-09, por decidir).
  if (!editable) notFound();
  const base = `/condominios/${id}`;

  const ruta = (
    <nav aria-label="Ruta" className="mb-2 text-sm text-texto-suave">
      <Link href={base} className="hover:text-marca">
        {condominio.nombre}
      </Link>
      <span aria-hidden="true"> › </span>
      <Link href={`${base}/configuracion`} className="hover:text-marca">
        Configuración
      </Link>
      <span aria-hidden="true"> › </span>
      <span>Apertura financiera</span>
    </nav>
  );

  if (condominio.modalidad !== "EXISTENTE") {
    return (
      <>
        {ruta}
        <PageHeader titulo="Apertura financiera" descripcion="Saldos que una comunidad trae de su administración o sistema anterior." />
        <Vacio>
          Solo se usa en comunidades existentes. Si esta comunidad ya funcionaba con otra administración, márcala como «Comunidad
          existente» en{" "}
          <Link href={`${base}/editar`} className="font-semibold text-marca hover:underline">
            Identificación
          </Link>
          .
        </Vacio>
      </>
    );
  }

  const registro = await db.apertura.findUnique({ where: { condominioId: id }, select: { id: true } });
  const ap = registro ? await datosApertura(registro.id) : null;
  const borrador = !ap || ap.apertura.estado === "BORRADOR";
  const [unidades, proveedores] = await Promise.all([
    db.unidad.findMany({ where: { condominioId: id }, select: { id: true, numero: true } }),
    db.proveedor.findMany({ where: { administradoraId: condominio.administradoraId }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ]);
  unidades.sort((a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }));
  const opcionesUnidad = unidades.map((u) => ({ valor: u.id, texto: u.numero }));
  const eliminar = (tabla: TablaApertura, rid: string) =>
    borrador && (
      <BotonAccion accion={eliminarDeApertura.bind(null, id, tabla, rid)} pregunta="¿Eliminar este registro de la apertura?">
        Eliminar
      </BotonAccion>
    );

  const camposCorte: CampoForm[] = [
    { name: "fechaCorte", etiqueta: "Fecha de corte", tipo: "fecha", requerido: true, valor: diaISO(ap?.apertura.fechaCorte), ayuda: "Último día que llevó el sistema anterior." },
    { name: "observaciones", etiqueta: "Observaciones", valor: ap?.apertura.observaciones ?? "", placeholder: "Ej. Cartola y planilla de la administración anterior al 30-11" },
  ];

  return (
    <>
      {ruta}
      <PageHeader
        titulo="Apertura financiera"
        descripcion="Lo que la comunidad trae del sistema anterior a la fecha de corte: deudas por unidad, saldos a favor, fondos, bancos y cuentas por pagar."
      />

      <p className="mb-6 flex items-start gap-2 rounded-xl bg-alerta-suave px-4 py-3 text-sm text-alerta">
        <Lock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Es un borrador de control: todavía no cambia cobros, pagos, intereses, morosidad ni la página de Fondos. Aprobarla y que esos
          saldos se cobren queda restringido hasta que se aprueben las reglas de apertura (D-COM-05 a D-COM-08) y el libro de fondos.
        </span>
      </p>

      {/* ── Fecha de corte ── */}
      <Card className="mb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Fecha de corte</h2>
          {ap && <Insignia tono={ap.apertura.estado === "BORRADOR" ? "alerta" : "marca"}>{ESTADOS_APERTURA[ap.apertura.estado].texto}</Insignia>}
        </div>
        {ap && (
          <p className="mb-4 text-sm text-texto-suave">
            Corte el {formatoFecha(ap.apertura.fechaCorte)}: Convive registra desde el{" "}
            {formatoFecha(new Date(ap.apertura.fechaCorte.getTime() + 86_400_000))}. Preparada por {ap.apertura.preparadoPor}.
          </p>
        )}
        {borrador ? (
          <FormularioApertura accion={guardarApertura.bind(null, id)} campos={camposCorte} textoBoton={ap ? "Guardar" : "Comenzar apertura"} />
        ) : (
          <p className="text-sm">{ESTADOS_APERTURA.EN_REVISION.ayuda}</p>
        )}
      </Card>

      {ap && <Contenido />}
      <datalist id="conceptos">
        {CONCEPTOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );

  function Contenido() {
    const { apertura, resumen: r, datos } = ap!;
    const rev = revisarApertura(datos, r);
    return (
      <>
        {/* ── Resumen ── */}
        <section aria-labelledby="resumen" className="mb-10">
          <h2 id="resumen" className="mb-3 text-xl font-bold">
            Resumen a la fecha de corte
          </h2>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {[
              ["Deudas por cobrar", $(r.deudas.cobrable), `${r.deudas.unidades} ${r.deudas.unidades === 1 ? "unidad" : "unidades"}`],
              ["Discutidas o por verificar", $(r.deudas.porEstado.DISCUTIDA.monto + r.deudas.porEstado.POR_VERIFICAR.monto), "No cuentan como morosidad"],
              ["Saldos a favor", $(r.creditos.aFavor), r.creditos.porIdentificar ? `${$(r.creditos.porIdentificar)} por identificar` : "Sin pagos por identificar"],
              ["Cuentas por pagar", $(r.obligaciones.total), "Proveedores y otros"],
              ["Fondos (saldo contable)", $(r.fondos.contable), `Reserva: ${$(r.fondos.reserva)}`],
              ["Pendiente de recaudar", $(r.fondos.pendiente), "Emitido y no pagado: no es dinero"],
              ["Bancos y caja (ajustado)", $(r.bancos.ajustado), `Cartola: ${$(r.bancos.cartola)}`],
              ["Diferencia banco − fondos", $(r.cuadre.diferencia), r.cuadre.nivel === "cuadra" ? "Cuadra" : r.cuadre.nivel === "menor" ? "Menor al umbral" : "Mayor al umbral"],
            ].map(([t, v, s]) => (
              <div key={t} className="sombra-convive rounded-2xl border border-borde bg-white p-4">
                <p className="text-sm text-texto-suave">{t}</p>
                <p className="mt-1 text-xl font-bold text-convive-oscuro">{v}</p>
                <p className="text-xs text-texto-suave">{s}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-2 font-bold">Antigüedad de lo que se cobra</h3>
              <p className="mb-2 text-xs text-texto-suave">Confirmadas y en convenio, días de atraso a la fecha de corte.</p>
              <Tabla>
                <tbody>
                  {TRAMOS.map((t) => (
                    <tr key={t}>
                      <td>{t === "por vencer" ? "Por vencer" : t === "más de 180" ? "Más de 180 días" : `${t} días`}</td>
                      <td className="text-right">{$(r.deudas.porTramo[t])}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Card>
            <Card>
              <h3 className="mb-2 font-bold">Revisión</h3>
              {rev.bloqueos.length === 0 && rev.advertencias.length === 0 && <p className="text-sm text-exito">Sin observaciones.</p>}
              <ul className="mb-3 space-y-1 text-sm">
                {rev.bloqueos.map((b) => (
                  <li key={b} className="text-peligro">
                    • {b}
                  </li>
                ))}
                {rev.advertencias.map((a) => (
                  <li key={a} className="text-alerta">
                    • {a}
                  </li>
                ))}
              </ul>
              <p className="mb-3 text-xs text-texto-suave">
                Cuadre: banco según cartola, menos cheques girados no cobrados, más depósitos no abonados, comparado con la suma de los
                saldos contables de los fondos. Umbral provisional: {formatoMoneda(UMBRAL_DIFERENCIA)} (D-COM-07, por decidir).
              </p>
              {apertura.estado === "BORRADOR" ? (
                rev.ok && (
                  <BotonAccion accion={cambiarEstadoApertura.bind(null, id, "EN_REVISION")} pregunta="¿Marcarla lista para revisión? Quedará cerrada hasta volver a borrador.">
                    Marcar lista para revisión
                  </BotonAccion>
                )
              ) : (
                <BotonAccion accion={cambiarEstadoApertura.bind(null, id, "BORRADOR")} pregunta="¿Volver a borrador para corregir?">
                  Volver a borrador
                </BotonAccion>
              )}
              <p className="mt-3 flex items-center gap-1 text-xs text-texto-suave">
                <Lock size={14} aria-hidden="true" /> Aprobar la apertura: restringido hasta aprobar las reglas.
              </p>
            </Card>
          </div>
        </section>

        {/* ── Deudas ── */}
        <Seccion id="deudas" titulo="Deudas por unidad" ayuda="Desglosadas por mes y concepto. El total de cada unidad lo calcula Convive; nunca se registra como una deuda más.">
          {apertura.deudas.length === 0 ? (
            <Vacio>Aún no hay deudas registradas.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Período</th>
                  <th>Concepto</th>
                  <th className="text-right">Original</th>
                  <th className="text-right">Abonos</th>
                  <th className="text-right">Saldo</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apertura.deudas.map((d) => (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.unidad.numero}</td>
                    <td className="whitespace-nowrap">{textoPeriodo(d.periodo)}</td>
                    <td>
                      {d.concepto}
                      {d.origen && d.origen !== "pantalla" && <span className="block text-xs text-texto-suave">{d.origen}</span>}
                    </td>
                    <td className="text-right whitespace-nowrap">{$(d.montoOriginal)}</td>
                    <td className="text-right whitespace-nowrap">{$(d.abonos)}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{$(d.saldo)}</td>
                    <td className="whitespace-nowrap">{d.vencimiento ? formatoFecha(d.vencimiento) : "—"}</td>
                    <td>
                      <Insignia tono={ESTADOS_DEUDA[d.estado].tono}>{ESTADOS_DEUDA[d.estado].texto}</Insignia>
                    </td>
                    <td>{eliminar("deuda", d.id)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {borrador && unidades.length > 0 && (
            <div className="mt-4 grid gap-4">
              <Card>
                <h3 className="mb-3 font-bold">Agregar una deuda</h3>
                <FormularioApertura
                  accion={agregarDeuda.bind(null, id)}
                  textoBoton="Agregar deuda"
                  campos={[
                    { name: "unidadId", etiqueta: "Unidad", tipo: "select", opciones: opcionesUnidad },
                    { name: "periodo", etiqueta: "Mes de origen", tipo: "mes", requerido: true },
                    { name: "concepto", etiqueta: "Concepto", valor: "Gasto común", requerido: true },
                    { name: "estado", etiqueta: "Estado", tipo: "select", opciones: ORDEN_ESTADOS_DEUDA.map((e) => ({ valor: e, texto: ESTADOS_DEUDA[e].texto })) },
                    { name: "montoOriginal", etiqueta: "Monto original", tipo: "monto", ayuda: "Opcional" },
                    { name: "abonos", etiqueta: "Abonos", tipo: "monto", ayuda: "Opcional" },
                    { name: "saldo", etiqueta: "Saldo pendiente", tipo: "monto", requerido: true },
                    { name: "vencimiento", etiqueta: "Vencimiento", tipo: "fecha" },
                    { name: "respaldo", etiqueta: "Respaldo", placeholder: "Ej. Estado de cuenta 30-11", ancho: true },
                  ]}
                />
              </Card>
              <Card>
                <h3 className="mb-3 font-bold">Cargar deudas desde Excel</h3>
                <CargaDeudas revisar={revisarDeudasPlanilla.bind(null, id)} confirmar={confirmarDeudasPlanilla.bind(null, id)} plantilla={`${base}/apertura/plantilla`} />
              </Card>
            </div>
          )}
        </Seccion>

        {/* ── Saldos a favor ── */}
        <Seccion id="creditos" titulo="Saldos a favor y pagos por identificar" ayuda="Anticipos o pagos de más de una unidad. Un pago sin unidad conocida queda «por identificar».">
          {apertura.creditos.length === 0 ? (
            <Vacio>No hay saldos a favor registrados.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th className="text-right">Monto</th>
                  <th>Fecha</th>
                  <th>Detalle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apertura.creditos.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.unidad?.numero ?? <Insignia tono="alerta">Por identificar</Insignia>}</td>
                    <td className="text-right whitespace-nowrap">{$(c.monto)}</td>
                    <td>{c.fecha ? formatoFecha(c.fecha) : "—"}</td>
                    <td>{c.descripcion ?? "—"}</td>
                    <td>{eliminar("credito", c.id)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {borrador && (
            <Card className="mt-4">
              <FormularioApertura
                accion={agregarCredito.bind(null, id)}
                textoBoton="Agregar"
                campos={[
                  { name: "unidadId", etiqueta: "Unidad", tipo: "select", opciones: [{ valor: "", texto: "Sin unidad (por identificar)" }, ...opcionesUnidad] },
                  { name: "monto", etiqueta: "Monto", tipo: "monto", requerido: true },
                  { name: "fecha", etiqueta: "Fecha", tipo: "fecha" },
                  { name: "descripcion", etiqueta: "Detalle", placeholder: "Ej. Transferencia sin glosa" },
                ]}
              />
            </Card>
          )}
        </Seccion>

        {/* ── Fondos ── */}
        <Seccion id="fondos" titulo="Fondos" ayuda="Saldo contable (dinero que le corresponde al fondo) separado de lo emitido y no pagado.">
          {apertura.fondos.length === 0 ? (
            <Vacio>Aún no hay fondos registrados.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Fondo</th>
                  <th>Tipo</th>
                  <th className="text-right">Saldo contable</th>
                  <th className="text-right">Pendiente de recaudar</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apertura.fondos.map((f) => (
                  <tr key={f.id}>
                    <td className="font-semibold">{f.nombre}</td>
                    <td>{TIPOS_FONDO[f.tipo]}</td>
                    <td className="text-right whitespace-nowrap">{$(f.saldoContable)}</td>
                    <td className="text-right whitespace-nowrap">{f.pendienteRecaudar === null ? "Sin dato" : $(f.pendienteRecaudar)}</td>
                    <td>{eliminar("fondo", f.id)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {borrador && (
            <Card className="mt-4">
              <FormularioApertura
                accion={agregarFondo.bind(null, id)}
                textoBoton="Agregar fondo"
                campos={[
                  { name: "tipo", etiqueta: "Tipo", tipo: "select", opciones: opciones(TIPOS_FONDO) },
                  { name: "nombre", etiqueta: "Nombre", requerido: true, placeholder: "Ej. Fondo de reserva" },
                  { name: "saldoContable", etiqueta: "Saldo contable", tipo: "monto", requerido: true },
                  { name: "pendienteRecaudar", etiqueta: "Pendiente de recaudar", tipo: "monto", ayuda: "Vacío = sin dato (no es cero)" },
                ]}
              />
            </Card>
          )}
        </Seccion>

        {/* ── Bancos ── */}
        <Seccion id="bancos" titulo="Bancos y caja" ayuda="Saldo según cartola a la fecha de corte y partidas en tránsito. Del número de cuenta se guardan solo los últimos 4 dígitos.">
          {apertura.cuentas.length === 0 ? (
            <Vacio>Aún no hay cuentas registradas.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th className="text-right">Cartola</th>
                  <th className="text-right">Cheques no cobrados</th>
                  <th className="text-right">Depósitos no abonados</th>
                  <th className="text-right">Ajustado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apertura.cuentas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-semibold">{c.banco}</span>
                      <span className="block text-xs text-texto-suave">
                        {TIPOS_CUENTA[c.tipo]}
                        {c.numeroFinal ? ` ···${c.numeroFinal}` : ""}
                      </span>
                    </td>
                    <td className="text-right whitespace-nowrap">{$(c.saldoCartola)}</td>
                    <td className="text-right whitespace-nowrap">{$(c.chequesNoCobrados)}</td>
                    <td className="text-right whitespace-nowrap">{$(c.depositosNoAbonados)}</td>
                    <td className="text-right font-semibold whitespace-nowrap">{$(saldoAjustado(c))}</td>
                    <td>{eliminar("cuenta", c.id)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {borrador && (
            <Card className="mt-4">
              <FormularioApertura
                accion={agregarCuenta.bind(null, id)}
                textoBoton="Agregar cuenta"
                campos={[
                  { name: "tipo", etiqueta: "Tipo", tipo: "select", opciones: opciones(TIPOS_CUENTA) },
                  { name: "banco", etiqueta: "Banco", requerido: true, placeholder: "Ej. Banco Ficticio o Caja" },
                  { name: "numeroFinal", etiqueta: "Últimos 4 dígitos", placeholder: "1234" },
                  { name: "titular", etiqueta: "Titular", placeholder: "Comunidad …" },
                  { name: "saldoCartola", etiqueta: "Saldo según cartola", tipo: "monto", requerido: true },
                  { name: "chequesNoCobrados", etiqueta: "Cheques girados no cobrados", tipo: "monto" },
                  { name: "depositosNoAbonados", etiqueta: "Depósitos no abonados", tipo: "monto" },
                ]}
              />
            </Card>
          )}
        </Seccion>

        {/* ── Obligaciones ── */}
        <Seccion id="obligaciones" titulo="Cuentas por pagar" ayuda="Proveedores, remuneraciones, impuestos u otros acreedores pendientes a la fecha de corte.">
          {apertura.obligaciones.length === 0 ? (
            <Vacio>No hay cuentas por pagar registradas.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th>Acreedor</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th>Vence</th>
                  <th className="text-right">Monto</th>
                  <th>Se paga con</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apertura.obligaciones.map((o) => (
                  <tr key={o.id}>
                    <td className="font-semibold">{o.proveedor?.nombre ?? o.acreedor}</td>
                    <td>{TIPOS_OBLIGACION[o.tipo]}</td>
                    <td>{o.documento ?? "—"}</td>
                    <td>{o.vencimiento ? formatoFecha(o.vencimiento) : "—"}</td>
                    <td className="text-right whitespace-nowrap">{$(o.monto)}</td>
                    <td>{o.fondo ?? <span className="text-alerta">Sin indicar</span>}</td>
                    <td>{eliminar("obligacion", o.id)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
          {borrador && (
            <Card className="mt-4">
              <FormularioApertura
                accion={agregarObligacion.bind(null, id)}
                textoBoton="Agregar"
                campos={[
                  { name: "tipo", etiqueta: "Tipo", tipo: "select", opciones: opciones(TIPOS_OBLIGACION) },
                  { name: "acreedor", etiqueta: "Acreedor", requerido: true },
                  { name: "proveedorId", etiqueta: "Proveedor del catálogo", tipo: "select", opciones: [{ valor: "", texto: "Ninguno" }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))] },
                  { name: "documento", etiqueta: "Documento", placeholder: "Factura 123" },
                  { name: "fecha", etiqueta: "Fecha del documento", tipo: "fecha" },
                  { name: "vencimiento", etiqueta: "Vencimiento", tipo: "fecha" },
                  { name: "monto", etiqueta: "Monto", tipo: "monto", requerido: true },
                  { name: "fondo", etiqueta: "Se paga con el fondo", tipo: "select", opciones: [{ valor: "", texto: "Sin indicar" }, ...apertura.fondos.map((f) => ({ valor: f.nombre, texto: f.nombre }))] },
                ]}
              />
            </Card>
          )}
        </Seccion>
      </>
    );
  }
}

function Seccion({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="mb-1 scroll-mt-24 text-xl font-bold">
        {titulo}
      </h2>
      <p className="mb-4 text-sm text-texto-suave">{ayuda}</p>
      {children}
    </section>
  );
}
