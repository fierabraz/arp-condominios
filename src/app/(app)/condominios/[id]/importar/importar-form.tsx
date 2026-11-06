"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Boton, Input, Insignia, Mensaje, Select, Tabla } from "@/components/ui";
import type { EstadoImportacion } from "../../importar-actions";
import { COLOR_ALICUOTAS, estadoAlicuotas } from "@/lib/alicuotas";
import { COLUMNAS, type ErrorFila } from "@/lib/importacion";
import { TIPOS_VINCULO } from "@/lib/vinculos";

type Accion = (estado: EstadoImportacion, formData: FormData) => Promise<EstadoImportacion>;

const TIPOS: Record<string, string> = {
  DEPARTAMENTO: "Departamento",
  CASA: "Casa",
  OFICINA: "Oficina",
  LOCAL: "Local",
  ESTACIONAMIENTO: "Estacionamiento",
  BODEGA: "Bodega",
};
const pct = (n: number) => `${n.toLocaleString("es-CL", { maximumFractionDigits: 6 })} %`;
const TAMANO_MAXIMO = 900 * 1024;
const fecha = (iso: string) => iso.split("-").reverse().join("-");
/** "Hoja Unidades, fila 4: …" para encontrar el error en Excel. */
const textoError = (e: ErrorFila) => (e.fila > 0 ? `${e.hoja ? `Hoja ${e.hoja}, fila` : "Fila"} ${e.fila}: ${e.mensaje}` : e.mensaje);

export function ImportarForm({
  condominioId,
  totalUnidades,
  revisar,
  asignar,
  confirmar,
}: {
  condominioId: string;
  /** Total de unidades guardado en la propiedad (null si no se ha indicado). */
  totalUnidades: number | null;
  revisar: Accion;
  asignar: Accion;
  confirmar: Accion;
}) {
  // Cada vez que se vuelve a empezar, el formulario se monta de nuevo y queda limpio.
  const [vuelta, setVuelta] = useState(0);
  return (
    <Pasos
      key={vuelta}
      condominioId={condominioId}
      totalUnidades={totalUnidades}
      revisar={revisar}
      asignar={asignar}
      confirmar={confirmar}
      otraVez={() => setVuelta((v) => v + 1)}
    />
  );
}

function Pasos({
  condominioId,
  totalUnidades,
  revisar,
  asignar,
  confirmar,
  otraVez,
}: {
  condominioId: string;
  totalUnidades: number | null;
  revisar: Accion;
  asignar: Accion;
  confirmar: Accion;
  otraVez: () => void;
}) {
  const [editando, setEditando] = useState(false);
  // Subir el archivo o asignar sus columnas a mano llevan a la misma revisión.
  const [revision, enviarArchivo, leyendo] = useActionState(async (e: EstadoImportacion, fd: FormData) => {
    const r = fd.get("paso") === "columnas" ? await asignar(e, fd) : await revisar(e, fd);
    setEditando(false);
    return r;
  }, { etapa: "inicio" });
  const [final, enviarConfirmacion, guardando] = useActionState(confirmar, { etapa: "inicio" });
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const base = `/condominios/${condominioId}`;

  if (final.etapa === "listo") {
    const r = final.resumen;
    const estado = estadoAlicuotas({ cargadas: final.totalUnidades, suma: final.sumaAlicuotas, total: final.totalPropiedad });
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-lg font-bold text-exito">
          <CheckCircle2 size={22} aria-hidden="true" /> Carga lista
        </p>
        <ul className="list-inside list-disc text-sm">
          <li>{r.unidadesNuevas} unidades nuevas y {r.unidadesActualizadas} actualizadas</li>
          <li>
            {r.personasNuevas} personas nuevas{r.personasCompletadas ? ` y ${r.personasCompletadas} con datos completados` : ""}
          </li>
          <li>{r.vinculosNuevos} {r.vinculosNuevos === 1 ? "vínculo nuevo" : "vínculos nuevos"} de personas con sus unidades</li>
        </ul>
        <AvisoAlicuotas estado={estado} condominioId={condominioId} />
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/invitaciones`} className="inline-flex min-h-11 items-center rounded-xl bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscuro">
            Invitar a los residentes
          </Link>
          <Link href={`${base}/unidades`} className="inline-flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-semibold hover:bg-convive-suave/70">
            Ver unidades
          </Link>
          <Boton type="button" variante="secundario" onClick={otraVez}>
            Cargar otra planilla
          </Boton>
        </div>
      </div>
    );
  }

  if (revision.etapa === "columnas" || (revision.etapa === "revision" && editando)) {
    return (
      <AsignarColumnas
        estado={revision}
        enviar={enviarArchivo}
        enviando={leyendo}
        otraVez={otraVez}
        volver={revision.etapa === "revision" ? () => setEditando(false) : undefined}
      />
    );
  }

  if (revision.etapa === "revision") {
    const { plan, errores } = revision;
    const nuevas = plan.unidades.filter((u) => u.accion === "crear");
    const cambiadas = plan.unidades.filter((u) => u.accion === "actualizar");
    const personasNuevas = plan.personas.filter((p) => p.accion === "crear");
    const completadas = plan.personas.filter((p) => p.accion === "completar");
    const vinculosNuevos = plan.vinculos.filter((v) => v.nuevo);
    const nombrePersona = new Map(plan.personas.map((p) => [p.clave, p.nombre]));
    const estado = estadoAlicuotas({ cargadas: plan.totalUnidades, suma: plan.sumaAlicuotas, total: revision.totalPropiedad });
    const bloqueado = errores.length > 0 || !revision.hayCambios;
    const errorFinal = final.etapa === "inicio" ? final.errores : undefined;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold">Revisión de {revision.archivo}</h2>
          <p className="text-sm text-texto-suave">
            {revision.nombreHoja !== revision.archivo && <>Hoja «{revision.nombreHoja}». </>}
            {revision.perfil && <>Se leyó con el perfil «{revision.perfil}». </>}
            Todavía no se guardó nada.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Cifra etiqueta="Unidades nuevas" valor={nuevas.length} />
          <Cifra etiqueta="Unidades que cambian" valor={cambiadas.length} />
          <Cifra etiqueta="Personas nuevas" valor={personasNuevas.length} />
          <Cifra etiqueta="Vínculos nuevos" valor={vinculosNuevos.length} />
        </div>

        {errores.length > 0 && (
          <div className="rounded-xl border border-peligro-suave bg-peligro-suave p-4 text-sm text-peligro">
            <p className="mb-2 flex items-center gap-2 font-bold">
              <AlertTriangle size={18} aria-hidden="true" />
              {errores.length} {errores.length === 1 ? "fila tiene" : "filas tienen"} problemas. Corrígelas en Excel y vuelve a subir
              la planilla:
            </p>
            <ul className="max-h-64 list-inside list-disc space-y-1 overflow-y-auto">
              {errores.map((e, i) => (
                <li key={i}>{textoError(e)}</li>
              ))}
            </ul>
          </div>
        )}
        {revision.avisos.map((a) => (
          <p key={a} className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
            {a}
          </p>
        ))}
        <AvisoAlicuotas
          estado={estado}
          condominioId={condominioId}
          prefijo="Después de cargar: "
          sufijo={estado.tipo === "error" ? " Puedes cargar igual y corregirlas después." : undefined}
        />
        {revision.totalNuevo && (
          <p className="text-sm text-texto-suave">
            Al confirmar se guardará que la propiedad tiene {revision.totalPropiedad} unidades en total.
          </p>
        )}

        {(nuevas.length > 0 || cambiadas.length > 0) && (
          <section>
            <h3 className="mb-2 font-semibold">Unidades</h3>
            <Tabla>
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Tipo</th>
                  <th>Alícuota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...nuevas, ...cambiadas].map((u) => (
                  <tr key={u.numero}>
                    <td className="font-semibold">{u.numero}</td>
                    <td>
                      {u.antes && u.antes.tipo !== u.tipo && <s className="mr-1 text-texto-suave">{TIPOS[u.antes.tipo]}</s>}
                      {TIPOS[u.tipo]}
                    </td>
                    <td>
                      {u.antes && Math.abs(u.antes.alicuota - u.alicuota) > 1e-6 && (
                        <s className="mr-1 text-texto-suave">{pct(u.antes.alicuota)}</s>
                      )}
                      {pct(u.alicuota)}
                    </td>
                    <td>{u.accion === "crear" ? <Insignia tono="marca">Nueva</Insignia> : <Insignia tono="alerta">Cambia</Insignia>}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </section>
        )}

        {(personasNuevas.length > 0 || completadas.length > 0 || vinculosNuevos.length > 0) && (
          <section>
            <h3 className="mb-2 font-semibold">Personas</h3>
            <Tabla>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>RUT</th>
                  <th>Correo</th>
                  <th>Unidades nuevas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {plan.personas
                  .filter((p) => p.accion !== "igual" || vinculosNuevos.some((v) => v.persona === p.clave))
                  .map((p) => (
                    <tr key={p.clave}>
                      <td className="font-semibold">{p.nombre}</td>
                      <td>{p.documento ?? "—"}</td>
                      <td>{p.correo ?? <span className="text-alerta">Sin correo</span>}</td>
                      <td className="text-texto-suave">
                        {vinculosNuevos
                          .filter((v) => v.persona === p.clave)
                          .map(
                            (v) =>
                              `${v.numero} (${TIPOS_VINCULO[v.relacion].texto.toLowerCase()}${v.desde ? ` desde el ${fecha(v.desde)}` : ""})`,
                          )
                          .join(", ") || "—"}
                      </td>
                      <td>
                        {p.accion === "crear" ? (
                          <Insignia tono="marca">Nueva</Insignia>
                        ) : p.accion === "completar" ? (
                          <Insignia tono="alerta">Se completan datos</Insignia>
                        ) : (
                          <Insignia>Ya registrada</Insignia>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Tabla>
            {nombrePersona.size > 0 && personasNuevas.some((p) => !p.correo) && (
              <p className="mt-2 text-sm text-texto-suave">
                Las personas sin correo se cargan igual, pero para invitarlas a la app hay que agregarles el correo.
              </p>
            )}
          </section>
        )}

        {!revision.hayCambios && errores.length === 0 && (
          <Mensaje tipo="ok" texto="Todo lo de la planilla ya está cargado. No hay nada nuevo que guardar." />
        )}
        {errorFinal?.map((e, i) => <Mensaje key={i} texto={e.mensaje} />)}

        <form action={enviarConfirmacion} className="flex flex-wrap gap-2">
          <input type="hidden" name="filas" value={revision.filas} />
          {revision.totalNuevo && <input type="hidden" name="totalUnidades" value={revision.totalPropiedad ?? ""} />}
          <Boton type="submit" disabled={bloqueado || guardando}>
            {guardando ? "Cargando…" : "Confirmar y cargar"}
          </Boton>
          {revision.hoja && (
            <Boton type="button" variante="secundario" onClick={() => setEditando(true)} disabled={guardando}>
              Cambiar columnas
            </Boton>
          )}
          <Boton type="button" variante="secundario" onClick={otraVez} disabled={guardando}>
            Subir otra planilla
          </Boton>
        </form>
      </div>
    );
  }

  return (
    <form
      action={enviarArchivo}
      className="space-y-4"
      onSubmit={(e) => {
        const archivo = (e.currentTarget.elements.namedItem("archivo") as HTMLInputElement).files?.[0];
        if (archivo && archivo.size > TAMANO_MAXIMO) {
          e.preventDefault();
          setErrorArchivo("El archivo pesa más de 900 KB. Divide la planilla en partes más chicas.");
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Planilla (.xlsx o .csv)</span>
        <input
          type="file"
          name="archivo"
          required
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={() => setErrorArchivo(undefined)}
          className="block w-full rounded-xl border border-dashed border-borde bg-fondo p-4 text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-marca file:px-4 file:font-semibold file:text-white"
        />
      </label>
      {totalUnidades ? (
        <p className="text-sm text-texto-suave">
          La propiedad tiene {totalUnidades} unidades en total. Si no es así, cámbialo en{" "}
          <Link href={`${base}/editar`} className="font-semibold text-marca hover:underline">
            Configurar propiedad
          </Link>
          .
        </p>
      ) : (
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm font-semibold">¿Cuántas unidades tiene la propiedad en total?</span>
          <Input type="number" name="totalUnidades" min={1} max={10000} placeholder="Ej. 100" />
          <span className="mt-1 block text-xs text-texto-suave">
            Cuenta todas las que tienen alícuota (departamentos, estacionamientos, bodegas…). Así, si cargas por partes, te
            mostramos el avance en vez de un aviso de alícuotas que no suman 100 %.
          </span>
        </label>
      )}
      <Mensaje texto={errorArchivo} />
      {(revision.etapa === "inicio" ? revision.errores : undefined)?.map((e, i) => <Mensaje key={i} texto={textoError(e)} />)}
      <Boton type="submit" disabled={leyendo}>
        <Upload size={16} aria-hidden="true" /> {leyendo ? "Leyendo planilla…" : "Revisar planilla"}
      </Boton>
    </form>
  );
}

type EstadoColumnas = Extract<EstadoImportacion, { etapa: "columnas" | "revision" }>;

/** Planilla propia: el usuario dice qué dato de Convive tiene cada columna. */
function AsignarColumnas({
  estado,
  enviar,
  enviando,
  otraVez,
  volver,
}: {
  estado: EstadoColumnas;
  enviar: (fd: FormData) => void;
  enviando: boolean;
  otraVez: () => void;
  volver?: () => void;
}) {
  const [guardar, setGuardar] = useState(!estado.perfil);
  const errores = estado.etapa === "columnas" ? estado.errores : undefined;
  return (
    <form action={enviar} className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">¿Qué tiene cada columna?</h2>
        <p className="text-sm text-texto-suave">
          {estado.archivo}
          {estado.nombreHoja !== estado.archivo && <> · hoja «{estado.nombreHoja}»</>}. Elige a qué dato de Convive corresponde cada
          columna de tu planilla. Las que digan «No usar» se ignoran. Todavía no se guardó nada.
        </p>
      </div>
      {errores?.map((e, i) => <Mensaje key={i} texto={textoError(e)} />)}
      {estado.hoja && estado.columnas.length > 0 ? (
        <>
          <input type="hidden" name="paso" value="columnas" />
          <input type="hidden" name="hoja" value={estado.hoja} />
          <input type="hidden" name="archivo" value={estado.archivo} />
          {estado.totalEscrito && <input type="hidden" name="totalUnidades" value={estado.totalEscrito} />}
          <Tabla>
            <thead>
              <tr>
                <th>Columna</th>
                <th>Ejemplos</th>
                <th>Dato de Convive</th>
              </tr>
            </thead>
            <tbody>
              {estado.columnas.map((c) => (
                <tr key={c.indice}>
                  <td>
                    <span className="mr-2 text-texto-suave">{c.letra}</span>
                    <span className="font-semibold">{c.titulo}</span>
                  </td>
                  <td className="text-sm text-texto-suave">{c.ejemplos.join(" · ") || "—"}</td>
                  <td>
                    <Select name={`col:${c.titulo}`} defaultValue={c.clave ?? "ignorar"} aria-label={`Dato de la columna ${c.letra}, ${c.titulo}`}>
                      <option value="ignorar">No usar</option>
                      {COLUMNAS.map((d) => (
                        <option key={d.clave} value={d.clave}>
                          {d.titulo}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
          <div className="rounded-xl border border-borde p-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="guardarPerfil" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="mt-1" />
              <span>
                <span className="font-semibold">Recordar estas columnas</span>
                <span className="block text-texto-suave">
                  La próxima planilla con estos mismos títulos se leerá sola. Solo lo ve tu administradora.
                </span>
              </span>
            </label>
            {guardar && (
              <label className="mt-3 block max-w-sm">
                <span className="mb-1 block text-sm font-semibold">Nombre del perfil</span>
                <Input name="nombrePerfil" required minLength={2} maxLength={60} defaultValue={estado.perfil ?? "Planilla propia"} />
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Leyendo planilla…" : "Revisar con estas columnas"}
            </Boton>
            {volver && (
              <Boton type="button" variante="secundario" onClick={volver} disabled={enviando}>
                Volver a la revisión
              </Boton>
            )}
            <Boton type="button" variante="secundario" onClick={otraVez} disabled={enviando}>
              Subir otra planilla
            </Boton>
          </div>
        </>
      ) : (
        <>
          <Mensaje
            texto={
              estado.hoja
                ? "No encontré títulos de columnas en la planilla. Agrega una fila de títulos (Unidad, Alícuota, Nombre…) y súbela otra vez."
                : "Esta planilla es muy grande para elegir las columnas aquí. Cambia el título de la columna de la unidad a «Unidad» o usa la planilla de Convive."
            }
          />
          <Boton type="button" variante="secundario" onClick={otraVez}>
            Subir otra planilla
          </Boton>
        </>
      )}
    </form>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-xl border border-borde p-3">
      <p className="text-xs text-texto-suave">{etiqueta}</p>
      <p className="text-xl font-bold">{valor}</p>
    </div>
  );
}

function AvisoAlicuotas({
  estado,
  condominioId,
  prefijo = "",
  sufijo = "",
}: {
  estado: ReturnType<typeof estadoAlicuotas>;
  condominioId: string;
  prefijo?: string;
  sufijo?: string;
}) {
  return (
    <p className={`rounded-xl px-3 py-2 text-sm ${COLOR_ALICUOTAS[estado.tipo]}`}>
      {prefijo}
      {prefijo ? estado.texto.charAt(0).toLowerCase() + estado.texto.slice(1) : estado.texto}
      {sufijo}
      {estado.tipo === "revisar" && (
        <>
          {" "}
          <Link href={`/condominios/${condominioId}/editar`} className="font-semibold underline">
            Indicar el total
          </Link>
        </>
      )}
    </p>
  );
}
