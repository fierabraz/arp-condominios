"use client";

// FIN-003.1 · Carga de cartolas: arrastrar y soltar o «Seleccionar archivo» (los dos caminos llaman a
// la misma función `elegir` y después al mismo procedimiento del servidor), asistente de columnas,
// vista previa con duplicados y confirmación. El archivo se queda en el navegador entre pasos y se
// vuelve a enviar al confirmar: el servidor lo lee de nuevo y no confía en lo que muestra la pantalla.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud, X } from "lucide-react";
import { Boton, Input, Insignia, Mensaje, Select, Tabla } from "@/components/ui";
import {
  BANCOS,
  CAMPOS_CARTOLA,
  FORMATOS_INICIALES,
  TEXTO_ESTADO_FILA,
  TEXTO_FORMATO_FECHA,
  TEXTO_SEPARADOR,
  TEXTO_SIGNO,
  type DestinoCartola,
  type ErrorCartola,
  type EstadoCartola,
  type FilaRevision,
  type Formatos,
  type OpcionesEnvio,
} from "@/lib/cartolas";
import { formatoMoneda } from "@/lib/formato";

type Accion = (formData: FormData) => Promise<EstadoCartola>;
type Revision = Extract<EstadoCartola, { etapa: "revision" }>;
type Columnas = Extract<EstadoCartola, { etapa: "columnas" }>;

/** Igual que en el servidor: bajo el límite de 1 MB de las acciones. */
const TAMANO_MAXIMO = 900 * 1024;
const EXTENSIONES = [".xlsx", ".csv"];

const fecha = (iso: string) => iso.slice(0, 10).split("-").reverse().join("-");
const tamano = (b: number) => (b < 1024 ? `${b} bytes` : `${(b / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} KB`);
const formatoDe = (nombre: string) => (nombre.toLowerCase().endsWith(".csv") ? "CSV (texto separado)" : "Excel (.xlsx)");
const origen = (e: { hoja: string; fila: number }, archivo: string) => (e.hoja === archivo ? `Fila ${e.fila}` : `Hoja ${e.hoja}, fila ${e.fila}`);

export function CargaCartola({
  revisar,
  confirmar,
  banco,
  base,
  moneda = "CLP",
}: {
  revisar: Accion;
  confirmar: Accion;
  /** Banco de la cuenta, para proponer el nombre del perfil. */
  banco: string;
  /** /condominios/[id]/conciliacion, para los enlaces del final. */
  base: string;
  moneda?: string;
}) {
  const [vuelta, setVuelta] = useState(0);
  return <Pasos key={vuelta} revisar={revisar} confirmar={confirmar} banco={banco} base={base} moneda={moneda} otraVez={() => setVuelta((v) => v + 1)} />;
}

function Pasos({ revisar, confirmar, banco, base, moneda, otraVez }: { revisar: Accion; confirmar: Accion; banco: string; base: string; moneda: string; otraVez: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [estado, setEstado] = useState<EstadoCartola>({ etapa: "inicio" });
  const [opciones, setOpciones] = useState<OpcionesEnvio>({});
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();

  /** Lo mismo para arrastrar y soltar que para «Seleccionar archivo». */
  function elegir(f: File | undefined | null) {
    setError(undefined);
    setEstado({ etapa: "inicio" });
    setOpciones({});
    setArchivo(null);
    if (!f) return;
    const nombre = f.name.toLowerCase();
    if (nombre.endsWith(".pdf")) return setError("Todavía no se pueden leer cartolas en PDF. Descárgala del banco en Excel (.xlsx) o CSV.");
    if (nombre.endsWith(".xls")) return setError("Ese es el formato antiguo de Excel (.xls). Ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)».");
    if (!EXTENSIONES.some((e) => nombre.endsWith(e))) return setError("Ese archivo no es una cartola en Excel (.xlsx) ni CSV.");
    if (f.size === 0) return setError("El archivo está vacío.");
    if (f.size > TAMANO_MAXIMO) return setError("El archivo pesa más de 900 KB. Descarga la cartola por un período más corto.");
    setArchivo(f);
  }

  function enviar(accion: Accion, o: OpcionesEnvio) {
    if (!archivo) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("opciones", JSON.stringify(o));
    iniciar(async () => {
      const r = await accion(fd);
      setEstado(r);
      setEditando(false);
    });
  }

  function leer(o: OpcionesEnvio) {
    // Lo que se elige para leer (hojas, columnas, formatos) se recuerda para confirmar igual.
    const recordar = { ...o, guardarPerfil: undefined };
    setOpciones(recordar);
    enviar(revisar, o);
  }

  if (estado.etapa === "listo") {
    return (
      <div className="space-y-4" aria-live="polite">
        <p className="flex items-center gap-2 text-lg font-bold text-exito">
          <CheckCircle2 size={22} aria-hidden="true" /> Cartola importada
        </p>
        <ul className="list-inside list-disc text-sm">
          <li>
            {estado.nuevos} {estado.nuevos === 1 ? "movimiento nuevo incorporado" : "movimientos nuevos incorporados"}
            {estado.periodo && ` (del ${fecha(estado.periodo.desde)} al ${fecha(estado.periodo.hasta)})`}
          </li>
          {estado.omitidos > 0 && <li>{estado.omitidos} ya estaban registrados y no se repitieron</li>}
          {estado.errores > 0 && <li>{estado.errores} filas con error quedaron fuera (se pueden consultar en el historial)</li>}
        </ul>
        <p className="text-sm text-texto-suave">Quedan «Pendientes de identificar». Todavía no pagan avisos ni cambian saldos de residentes.</p>
        <div className="flex flex-wrap gap-2">
          <Link href={`${base}/movimientos`} className="inline-flex min-h-11 items-center rounded-xl bg-marca px-4 text-sm font-semibold text-white hover:bg-marca-oscuro">
            Ver movimientos
          </Link>
          <Link href={`${base}/importaciones/${estado.importacionId}`} className="inline-flex min-h-11 items-center rounded-xl border border-borde px-4 text-sm font-semibold hover:bg-convive-suave/70">
            Ver esta importación
          </Link>
          <Boton type="button" variante="secundario" onClick={otraVez}>
            Cargar otra cartola
          </Boton>
        </div>
      </div>
    );
  }

  if (archivo && (estado.etapa === "columnas" || (estado.etapa === "revision" && editando))) {
    return (
      <Asistente
        estado={estado}
        banco={banco}
        pendiente={pendiente}
        leer={(o) => leer(o)}
        volver={estado.etapa === "revision" ? () => setEditando(false) : undefined}
        otraVez={otraVez}
      />
    );
  }

  if (archivo && estado.etapa === "revision") {
    return (
      <VistaPrevia
        estado={estado}
        moneda={moneda}
        pendiente={pendiente}
        cambiarColumnas={() => setEditando(true)}
        leerHojas={(hojas) => leer({ ...opciones, hojas })}
        confirmar={(extra) => enviar(confirmar, { ...opciones, ...extra })}
        otraVez={otraVez}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ZonaArchivo archivo={archivo} elegir={elegir} quitar={() => elegir(null)} deshabilitado={pendiente} />
      <Mensaje texto={error ?? (estado.etapa === "inicio" ? estado.mensaje : undefined)} />
      {archivo && (
        <Boton type="button" onClick={() => leer({})} disabled={pendiente}>
          {pendiente ? "Leyendo cartola…" : "Revisar cartola"}
        </Boton>
      )}
    </div>
  );
}

/** Zona para arrastrar y soltar, con el botón «Seleccionar archivo» para el explorador del dispositivo. */
function ZonaArchivo({ archivo, elegir, quitar, deshabilitado }: { archivo: File | null; elegir: (f: File | undefined) => void; quitar: () => void; deshabilitado: boolean }) {
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const profundidad = useRef(0);

  // Un archivo soltado fuera de la zona no debe abrirse en el navegador (se perdería la página).
  useEffect(() => {
    const evitar = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => {
      window.removeEventListener("dragover", evitar);
      window.removeEventListener("drop", evitar);
    };
  }, []);

  if (archivo) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-marca/40 bg-marca-suave p-4" data-testid="archivo-elegido">
        <FileSpreadsheet size={32} className="shrink-0 text-marca" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="break-all font-semibold">{archivo.name}</p>
          <p className="text-sm text-texto-suave">
            {tamano(archivo.size)} · {formatoDe(archivo.name)}
          </p>
        </div>
        <Boton type="button" variante="secundario" onClick={quitar} disabled={deshabilitado}>
          <X size={16} aria-hidden="true" /> Quitar archivo
        </Boton>
      </div>
    );
  }

  return (
    <div
      data-testid="zona-cartola"
      data-arrastrando={arrastrando ? "si" : "no"}
      onDragEnter={(e) => {
        e.preventDefault();
        profundidad.current++;
        setArrastrando(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        profundidad.current = Math.max(0, profundidad.current - 1);
        if (profundidad.current === 0) setArrastrando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        profundidad.current = 0;
        setArrastrando(false);
        elegir(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition md:p-10 ${
        arrastrando ? "border-marca bg-marca-suave ring-4 ring-convive/30" : "border-convive/50 bg-fondo"
      }`}
    >
      <UploadCloud size={40} className={arrastrando ? "text-marca" : "text-convive-oscuro/70"} aria-hidden="true" />
      <p className="text-lg font-bold text-convive-oscuro">{arrastrando ? "Suelta el archivo para cargarlo" : "Arrastra aquí tu cartola bancaria"}</p>
      <p className="max-w-md text-sm text-texto-suave">
        Excel (.xlsx) o CSV, tal como lo descargaste del banco, hasta 900 KB. No hace falta modificarla.
      </p>
      <p className="text-sm text-texto-suave">o</p>
      <Boton type="button" onClick={() => entrada.current?.click()} disabled={deshabilitado}>
        Seleccionar archivo
      </Boton>
      <input
        ref={entrada}
        type="file"
        name="cartola"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Asistente de interpretación: qué campo de Convive es cada columna, formatos y perfil reutilizable. */
function Asistente({
  estado,
  banco,
  pendiente,
  leer,
  volver,
  otraVez,
}: {
  estado: Columnas | Revision;
  banco: string;
  pendiente: boolean;
  leer: (o: OpcionesEnvio) => void;
  volver?: () => void;
  otraVez: () => void;
}) {
  const [mapeo, setMapeo] = useState<Record<string, DestinoCartola>>(() => Object.fromEntries(estado.columnas.map((c) => [c.titulo, c.clave ?? "ignorar"])));
  const [formatos, setFormatos] = useState<Formatos>(estado.formatos ?? FORMATOS_INICIALES);
  const [hojas, setHojas] = useState<string[]>(estado.hojas.filter((h) => h.elegida).map((h) => h.nombre));
  const [guardar, setGuardar] = useState(!estado.perfil);
  const [nombrePerfil, setNombrePerfil] = useState(estado.perfil?.nombre ?? `${banco} — Cartola cuenta corriente`);
  const [bancoPerfil, setBancoPerfil] = useState(estado.perfil?.banco ?? banco);
  const usaMonto = Object.values(mapeo).includes("monto");
  const mensaje = estado.etapa === "columnas" ? estado.mensaje : undefined;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        leer({ hojas, mapeo, formatos, guardarPerfil: guardar ? { nombre: nombrePerfil, banco: bancoPerfil } : undefined });
      }}
    >
      <div>
        <h2 className="text-lg font-bold">¿Qué tiene cada columna?</h2>
        <p className="text-sm text-texto-suave">
          {estado.archivo.nombre}. Indica a qué campo de Convive corresponde cada columna de la cartola; las que digan «No utilizar» se
          ignoran. Todavía no se guardó nada.
        </p>
      </div>
      {estado.etapa === "columnas" && estado.faltan.length > 0 && !mensaje && (
        <p className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">No reconocí {estado.faltan.join(" ni ")}. Elige las columnas que corresponden.</p>
      )}
      <Mensaje texto={mensaje} />

      {estado.hojas.length > 1 && <ElegirHojas hojas={estado.hojas} elegidas={hojas} cambiar={setHojas} />}

      {estado.columnas.length === 0 ? (
        <Mensaje texto="No encontré una fila de títulos en la hoja elegida. Prueba con otra hoja o revisa que sea la cartola del banco." />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Columna de la cartola</th>
              <th>Ejemplos</th>
              <th>Campo de Convive</th>
            </tr>
          </thead>
          <tbody>
            {estado.columnas.map((c) => (
              <tr key={c.titulo}>
                <td>
                  <span className="mr-2 text-texto-suave">{c.letra}</span>
                  <span className="font-semibold">{c.titulo}</span>
                </td>
                <td className="max-w-xs text-sm text-texto-suave">{c.ejemplos.join(" · ") || "—"}</td>
                <td className="min-w-48">
                  <Select
                    value={mapeo[c.titulo] ?? "ignorar"}
                    onChange={(e) => setMapeo({ ...mapeo, [c.titulo]: e.target.value as DestinoCartola })}
                    aria-label={`Campo de la columna ${c.letra}, ${c.titulo}`}
                  >
                    <option value="ignorar">No utilizar</option>
                    {CAMPOS_CARTOLA.map((d) => (
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
      )}

      <fieldset className="grid gap-3 rounded-xl border border-borde p-4 md:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Formatos de la cartola</legend>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Fechas</span>
          <Select value={formatos.fecha} onChange={(e) => setFormatos({ ...formatos, fecha: e.target.value as Formatos["fecha"] })}>
            {Object.entries(TEXTO_FORMATO_FECHA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-semibold">Montos</span>
          <Select value={formatos.decimal} onChange={(e) => setFormatos({ ...formatos, decimal: e.target.value as Formatos["decimal"] })}>
            {Object.entries(TEXTO_SEPARADOR).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        {usaMonto && (
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">Signo del monto</span>
            <Select value={formatos.signo} onChange={(e) => setFormatos({ ...formatos, signo: e.target.value as Formatos["signo"] })}>
              {Object.entries(TEXTO_SIGNO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
        )}
      </fieldset>

      <div className="rounded-xl border border-borde p-4">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-semibold">Guardar este formato como perfil</span>
            <span className="block text-texto-suave">
              La próxima cartola con estas mismas columnas se leerá sola. El perfil guarda solo títulos y formatos, nunca movimientos, y
              solo lo ve tu administradora.
            </span>
          </span>
        </label>
        {guardar && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Banco</span>
              <Input value={bancoPerfil} onChange={(e) => setBancoPerfil(e.target.value)} list="bancos-perfil" required minLength={2} maxLength={60} />
              <datalist id="bancos-perfil">
                {BANCOS.filter((b) => b !== "Otro").map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Nombre del perfil</span>
              <Input value={nombrePerfil} onChange={(e) => setNombrePerfil(e.target.value)} required minLength={2} maxLength={60} />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Boton type="submit" disabled={pendiente || !hojas.length}>
          {pendiente ? "Leyendo cartola…" : "Ver vista previa"}
        </Boton>
        {volver && (
          <Boton type="button" variante="secundario" onClick={volver} disabled={pendiente}>
            Volver a la vista previa
          </Boton>
        )}
        <Boton type="button" variante="secundario" onClick={otraVez} disabled={pendiente}>
          Elegir otro archivo
        </Boton>
      </div>
    </form>
  );
}

function ElegirHojas({ hojas, elegidas, cambiar }: { hojas: Revision["hojas"]; elegidas: string[]; cambiar: (h: string[]) => void }) {
  return (
    <fieldset className="rounded-xl border border-borde p-4">
      <legend className="px-1 text-sm font-semibold">Hojas del archivo</legend>
      <p className="mb-2 text-sm text-texto-suave">Marca las hojas que tienen movimientos de esta cuenta.</p>
      <ul className="space-y-2">
        {hojas.map((h) => (
          <li key={h.nombre}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={elegidas.includes(h.nombre)}
                onChange={(e) => cambiar(e.target.checked ? [...elegidas, h.nombre] : elegidas.filter((n) => n !== h.nombre))}
              />
              <span>
                <span className="font-semibold">{h.nombre}</span>{" "}
                <span className="text-texto-suave">
                  · {h.filas} filas con datos ·{" "}
                  {h.reconocida ? `${h.movimientos} posibles movimientos${h.perfil ? ` (perfil «${h.perfil}»)` : ""}` : "no reconocí columnas de movimientos"}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

type Filtro = "TODOS" | FilaRevision["estado"] | "ERROR";
const MOSTRAR = 300;

/** Vista previa: resumen, avisos, tabla filtrable, decisiones sobre posibles duplicados y confirmación. */
function VistaPrevia({
  estado,
  moneda,
  pendiente,
  cambiarColumnas,
  leerHojas,
  confirmar,
  otraVez,
}: {
  estado: Revision;
  moneda: string;
  pendiente: boolean;
  cambiarColumnas: () => void;
  leerHojas: (hojas: string[]) => void;
  confirmar: (o: OpcionesEnvio) => void;
  otraVez: () => void;
}) {
  const r = estado.resumen;
  const [filtro, setFiltro] = useState<Filtro>(r.porRevisar ? "POSIBLE_DUPLICADO" : r.errores ? "ERROR" : "TODOS");
  const [todas, setTodas] = useState(false);
  const [decisiones, setDecisiones] = useState<Record<string, "importar" | "omitir">>({});
  const [omitirErrores, setOmitirErrores] = useState(false);
  const [hojas, setHojas] = useState(estado.hojas.filter((h) => h.elegida).map((h) => h.nombre));
  const $ = (n: number) => formatoMoneda(n, moneda);

  const posibles = estado.filas.filter((f) => f.estado === "POSIBLE_DUPLICADO");
  const pendientes = posibles.filter((f) => !decisiones[f.huella]).length;
  const aImportar = r.nuevos + posibles.filter((f) => decisiones[f.huella] === "importar").length;
  const bloqueo =
    pendientes > 0
      ? `Decide qué hacer con ${pendientes === 1 ? "el posible duplicado" : `los ${pendientes} posibles duplicados`}.`
      : r.errores > 0 && !omitirErrores
        ? "Hay filas con error: corrige la cartola o marca que quieres importar solo los movimientos válidos."
        : aImportar === 0
          ? "No hay movimientos nuevos para importar."
          : undefined;

  const visibles = useMemo(() => {
    const filas: (FilaRevision | (ErrorCartola & { estado: "ERROR" }))[] =
      filtro === "ERROR" ? [] : filtro === "TODOS" ? [...estado.filas] : estado.filas.filter((f) => f.estado === filtro);
    if (filtro === "TODOS" || filtro === "ERROR") filas.push(...estado.errores.map((e) => ({ ...e, estado: "ERROR" as const })));
    return filas;
  }, [estado, filtro]);

  const chips: [Filtro, string, number][] = [
    ["TODOS", "Todos", r.encontrados],
    ["NUEVO", "Nuevos", r.nuevos],
    ["REGISTRADO", "Ya registrados", r.registrados],
    ["POSIBLE_DUPLICADO", "Por revisar", r.porRevisar],
    ["ERROR", "Con errores", r.errores],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Cartola procesada</h2>
        <p className="text-sm text-texto-suave">
          {estado.archivo.nombre} · {tamano(estado.archivo.tamano)} · {estado.archivo.formato === "XLSX" ? "Excel" : "CSV"}
          {estado.perfil && <> · leída con el perfil «{estado.perfil.nombre}»</>}
          {estado.periodo && <> · movimientos del {fecha(estado.periodo.desde)} al {fecha(estado.periodo.hasta)}</>}. Todavía no se guardó nada.
        </p>
      </div>

      {estado.perfilGuardado && <Mensaje tipo="ok" texto={`Perfil «${estado.perfilGuardado}» guardado: la próxima cartola con estas columnas se leerá sola.`} />}
      {estado.yaImportado && (
        <p className="rounded-xl bg-alerta-suave px-3 py-2 text-sm text-alerta">
          Este mismo archivo ya se importó el {fecha(estado.yaImportado.fecha)} ({estado.yaImportado.usuario}). Lo ya registrado no se vuelve a
          incorporar.
        </p>
      )}
      <Mensaje texto={estado.mensaje} />

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Resumen de la cartola">
        <Cifra etiqueta="Movimientos encontrados" valor={r.encontrados} />
        <Cifra etiqueta="Nuevos" valor={r.nuevos} tono="marca" />
        <Cifra etiqueta="Ya registrados" valor={r.registrados} />
        <Cifra etiqueta="Por revisar" valor={r.porRevisar} tono={r.porRevisar ? "alerta" : undefined} />
        <Cifra etiqueta="Con errores" valor={r.errores} tono={r.errores ? "peligro" : undefined} />
      </ul>

      {estado.avisos.length > 0 && (
        <ul className="space-y-1">
          {estado.avisos.map((a) => (
            <li key={a} className={`rounded-xl px-3 py-2 text-sm ${a.includes("cuadran con") ? "bg-exito-suave text-exito" : "bg-alerta-suave text-alerta"}`}>
              {a}
            </li>
          ))}
        </ul>
      )}

      {estado.hojas.length > 1 && (
        <div className="space-y-2">
          <ElegirHojas hojas={estado.hojas} elegidas={hojas} cambiar={setHojas} />
          <Boton type="button" variante="secundario" onClick={() => leerHojas(hojas)} disabled={pendiente || !hojas.length}>
            Leer de nuevo con estas hojas
          </Boton>
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar movimientos">
        {chips.map(([clave, texto, n]) => (
          <button
            key={clave}
            type="button"
            onClick={() => setFiltro(clave)}
            aria-pressed={filtro === clave}
            className={`min-h-9 rounded-full border px-3 text-sm font-semibold ${filtro === clave ? "border-marca bg-marca text-white" : "border-borde bg-white hover:bg-convive-suave"}`}
          >
            {texto} ({n})
          </button>
        ))}
      </div>

      {filtro === "POSIBLE_DUPLICADO" && posibles.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Boton type="button" variante="secundario" onClick={() => setDecisiones(Object.fromEntries(posibles.map((f) => [f.huella, "omitir"])))}>
            Todos son el mismo: no importar
          </Boton>
          <Boton type="button" variante="secundario" onClick={() => setDecisiones(Object.fromEntries(posibles.map((f) => [f.huella, "importar"])))}>
            Todos son otros: importar
          </Boton>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-borde p-4 text-center text-sm text-texto-suave">No hay movimientos en este filtro.</p>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th>Referencia</th>
              <th className="text-right">Cargo</th>
              <th className="text-right">Abono</th>
              <th className="text-right">Saldo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(todas ? visibles : visibles.slice(0, MOSTRAR)).map((f) =>
              f.estado === "ERROR" ? (
                <tr key={`e-${f.hoja}-${f.fila}`} className="bg-peligro-suave/40">
                  <td className="whitespace-nowrap text-texto-suave">—</td>
                  <td colSpan={5} className="text-peligro">
                    {f.mensaje}
                  </td>
                  <td>
                    <Insignia tono="peligro">Con error</Insignia>
                    <span className="mt-1 block text-xs text-texto-suave">{origen(f, estado.archivo.nombre)}</span>
                  </td>
                </tr>
              ) : (
                <tr key={f.huella}>
                  <td className="whitespace-nowrap">{fecha(f.fecha)}</td>
                  <td className="min-w-48">
                    {f.descripcion ?? "—"}
                    {f.contraparte && <span className="block text-xs text-texto-suave">{f.contraparte}</span>}
                  </td>
                  <td className="whitespace-nowrap">{f.referencia ?? "—"}</td>
                  <td className="whitespace-nowrap text-right text-peligro">{f.monto < 0 ? $(-f.monto) : ""}</td>
                  <td className="whitespace-nowrap text-right text-exito">{f.monto > 0 ? $(f.monto) : ""}</td>
                  <td className="whitespace-nowrap text-right">{f.saldo !== undefined ? $(f.saldo) : "—"}</td>
                  <td className="min-w-56">
                    <Insignia tono={f.estado === "NUEVO" ? "marca" : f.estado === "REGISTRADO" ? "neutro" : "alerta"}>{TEXTO_ESTADO_FILA[f.estado]}</Insignia>
                    <span className="mt-1 block text-xs text-texto-suave">{origen(f, estado.archivo.nombre)}</span>
                    {f.motivo && <span className="mt-1 block text-xs text-texto-suave">{f.motivo}</span>}
                    {f.estado === "POSIBLE_DUPLICADO" && f.parecido && (
                      <div className="mt-2 space-y-1 rounded-lg border border-alerta-suave bg-alerta-suave/40 p-2 text-xs">
                        <p>
                          Ya guardado: {fecha(f.parecido.fecha)} · {f.parecido.descripcion ?? "sin descripción"} · {$(Math.abs(f.parecido.monto))}
                          {f.parecido.referencia ? ` · ref. ${f.parecido.referencia}` : ""}
                        </p>
                        <fieldset className="flex flex-col gap-1">
                          <legend className="sr-only">¿Es el mismo movimiento?</legend>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`d-${f.huella}`}
                              checked={decisiones[f.huella] === "omitir"}
                              onChange={() => setDecisiones({ ...decisiones, [f.huella]: "omitir" })}
                            />
                            Es el mismo: no importar
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`d-${f.huella}`}
                              checked={decisiones[f.huella] === "importar"}
                              onChange={() => setDecisiones({ ...decisiones, [f.huella]: "importar" })}
                            />
                            Es otro movimiento: importar
                          </label>
                        </fieldset>
                      </div>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </Tabla>
      )}
      {!todas && visibles.length > MOSTRAR && (
        <Boton type="button" variante="secundario" onClick={() => setTodas(true)}>
          Mostrar los {visibles.length} movimientos (se ven {MOSTRAR})
        </Boton>
      )}

      {r.errores > 0 && (
        <div className="rounded-xl border border-peligro-suave bg-peligro-suave/50 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-bold text-peligro">
            <AlertTriangle size={18} aria-hidden="true" />
            {r.errores} {r.errores === 1 ? "fila tiene" : "filas tienen"} error y no se pueden importar.
          </p>
          <p className="mb-2 text-texto-suave">Lo más seguro es revisar la cartola (o las columnas) y volver a subirla. Si esas filas no son movimientos, puedes dejarlas fuera:</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={omitirErrores} onChange={(e) => setOmitirErrores(e.target.checked)} />
            <span>
              Importar solo los movimientos válidos. Las {r.errores} filas con error quedan fuera y anotadas en el historial de esta importación.
            </span>
          </label>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-borde bg-white/95 px-5 py-3 backdrop-blur">
        <Boton
          type="button"
          disabled={pendiente || !!bloqueo}
          onClick={() =>
            confirmar({
              decisiones,
              omitirErrores,
              esperado: { nuevos: r.nuevos, registrados: r.registrados, porRevisar: r.porRevisar },
            })
          }
        >
          {pendiente ? "Importando…" : `Confirmar e importar ${aImportar} ${aImportar === 1 ? "movimiento" : "movimientos"}`}
        </Boton>
        <Boton type="button" variante="secundario" onClick={cambiarColumnas} disabled={pendiente}>
          Cambiar columnas
        </Boton>
        <Boton type="button" variante="secundario" onClick={otraVez} disabled={pendiente}>
          Elegir otro archivo
        </Boton>
        {bloqueo && <span className="text-sm text-texto-suave">{bloqueo}</span>}
      </div>
    </div>
  );
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: "marca" | "alerta" | "peligro" }) {
  const color = tono === "marca" ? "text-marca" : tono === "alerta" ? "text-alerta" : tono === "peligro" ? "text-peligro" : "text-convive-oscuro";
  return (
    <li className="rounded-xl border border-borde bg-white p-3">
      <p className="text-xs text-texto-suave">{etiqueta}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
    </li>
  );
}
