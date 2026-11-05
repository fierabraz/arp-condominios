"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { Boton, Insignia, Mensaje, Tabla } from "@/components/ui";
import type { EstadoImportacion } from "../../importar-actions";

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

export function ImportarForm({ condominioId, revisar, confirmar }: { condominioId: string; revisar: Accion; confirmar: Accion }) {
  // Cada vez que se vuelve a empezar, el formulario se monta de nuevo y queda limpio.
  const [vuelta, setVuelta] = useState(0);
  return <Pasos key={vuelta} condominioId={condominioId} revisar={revisar} confirmar={confirmar} otraVez={() => setVuelta((v) => v + 1)} />;
}

function Pasos({
  condominioId,
  revisar,
  confirmar,
  otraVez,
}: {
  condominioId: string;
  revisar: Accion;
  confirmar: Accion;
  otraVez: () => void;
}) {
  const [revision, enviarArchivo, leyendo] = useActionState(revisar, { etapa: "inicio" });
  const [final, enviarConfirmacion, guardando] = useActionState(confirmar, { etapa: "inicio" });
  const [errorArchivo, setErrorArchivo] = useState<string>();
  const base = `/condominios/${condominioId}`;

  if (final.etapa === "listo") {
    const r = final.resumen;
    const cuadra = Math.abs(final.sumaAlicuotas - 100) < 0.0001;
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
          <li>{r.vinculosNuevos} propietarios o residentes vinculados a sus unidades</li>
        </ul>
        {!cuadra && (
          <Mensaje
            texto={`Las alícuotas de las ${final.totalUnidades} unidades suman ${pct(final.sumaAlicuotas)}. Deben sumar 100 % para cobrar bien: corrígelas antes de emitir el próximo cobro.`}
          />
        )}
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

  if (revision.etapa === "revision") {
    const { plan, errores } = revision;
    const nuevas = plan.unidades.filter((u) => u.accion === "crear");
    const cambiadas = plan.unidades.filter((u) => u.accion === "actualizar");
    const personasNuevas = plan.personas.filter((p) => p.accion === "crear");
    const completadas = plan.personas.filter((p) => p.accion === "completar");
    const vinculosNuevos = plan.vinculos.filter((v) => v.nuevo);
    const nombrePersona = new Map(plan.personas.map((p) => [p.clave, p.nombre]));
    const cuadra = Math.abs(plan.sumaAlicuotas - 100) < 0.0001;
    const bloqueado = errores.length > 0 || !revision.hayCambios;
    const errorFinal = final.etapa === "inicio" ? final.errores : undefined;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-bold">Revisión de {revision.archivo}</h2>
          <p className="text-sm text-texto-suave">Todavía no se guardó nada.</p>
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
                <li key={i}>{e.fila > 0 ? `Fila ${e.fila}: ${e.mensaje}` : e.mensaje}</li>
              ))}
            </ul>
          </div>
        )}
        {revision.avisos.map((a) => (
          <p key={a} className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
            {a}
          </p>
        ))}
        <p className={`rounded-xl px-3 py-2 text-sm ${cuadra ? "bg-exito-suave text-exito" : "bg-alerta-suave text-alerta"}`}>
          Después de cargar, las alícuotas de las {plan.totalUnidades} unidades sumarán {pct(plan.sumaAlicuotas)}
          {cuadra ? ". Cuadra." : ". Deberían sumar 100 % para cobrar bien; puedes cargar igual y corregirlas después."}
        </p>

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
                          .map((v) => `${v.numero} (${v.relacion === "PROPIETARIO" ? "propietario" : "residente"})`)
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
          <Boton type="submit" disabled={bloqueado || guardando}>
            {guardando ? "Cargando…" : "Confirmar y cargar"}
          </Boton>
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
      <Mensaje texto={errorArchivo} />
      {(revision.etapa === "inicio" ? revision.errores : undefined)?.map((e, i) => <Mensaje key={i} texto={e.fila > 1 ? `Fila ${e.fila}: ${e.mensaje}` : e.mensaje} />)}
      <Boton type="submit" disabled={leyendo}>
        <Upload size={16} aria-hidden="true" /> {leyendo ? "Leyendo planilla…" : "Revisar planilla"}
      </Boton>
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
