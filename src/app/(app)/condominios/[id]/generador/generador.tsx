"use client";

// COM-001-VIS · Asistente visual: preguntas por grupos a la izquierda y vista en planta a la derecha.
// Lo que se responde se guarda solo (borrador). Los registros se crean únicamente al confirmar.

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronLeft, ChevronRight, ExternalLink, Home, Layers, LayoutGrid, Save, TriangleAlert } from "lucide-react";
import { Boton, Insignia, Mensaje } from "@/components/ui";
import { PlanoComunidad } from "@/components/plano-comunidad";
import {
  ajustar,
  CATALOGO_INSTALACIONES,
  cambiarSectores,
  comparar,
  deptosDelPiso,
  distribuir,
  LIMITES,
  MODOS_ESPACIOS,
  planificar,
  repartir,
  resumenPlan,
  tipoRegistro,
  TIPOS_GENERADOR,
  type ClaveInstalacion,
  type Existentes,
  type ModoEspacios,
  type Registros,
  type RespEspacios,
  type Respuestas,
  type TipoGenerador,
  type Torre,
} from "@/lib/generador";
import { generar, guardarBorrador, guardarPosiciones, ordenarAutomaticamente } from "../../generador-actions";

const PASOS = ["Tipo", "Estructura", "Numeración", "Estacionamientos y bodegas", "Espacios comunes", "Revisar y crear"];

type Props = {
  condominioId: string;
  financiera: boolean;
  editable: boolean;
  inicial: Respuestas;
  registros: Registros;
  existentes: Existentes;
  posiciones: Record<string, { x: number; y: number }>;
  generadoEn: string | null;
};

export function Generador({ condominioId, financiera, editable, inicial, registros, existentes, posiciones, generadoEn }: Props) {
  const router = useRouter();
  const [r, setR] = useState<Respuestas>(inicial);
  const [paso, setPaso] = useState(inicial.tipo ? Math.max(inicial.paso, 1) : 0);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [movidos, setMovidos] = useState<Record<string, { x: number; y: number }>>({});
  const [estadoGuardado, setEstadoGuardado] = useState<"guardado" | "pendiente" | "guardando" | "error">("guardado");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const primera = useRef(true);

  const plan = useMemo(() => planificar(r), [r]);
  const comp = useMemo(() => comparar(plan, existentes, registros), [plan, existentes, registros]);
  const creados = useMemo(() => new Set(Object.keys(comp.ids)), [comp]);
  const resumen = resumenPlan(plan);

  // Posiciones guardadas (por registro) y las movidas en esta sesión (por clave).
  const guardadas = useMemo(() => {
    const g: Record<string, { x: number; y: number }> = {};
    const tipos: [string, string][] = [
      ...plan.agrupaciones.map((a) => [a.clave, "AGRUPACION"] as [string, string]),
      ...plan.unidades.map((u) => [u.clave, "UNIDAD"] as [string, string]),
      ...plan.espacios.map((e) => [e.clave, "ESPACIO"] as [string, string]),
      ...plan.instalaciones.map((i) => [i.clave, "INSTALACION"] as [string, string]),
    ];
    for (const [clave, tipo] of tipos) {
      const id = comp.ids[clave];
      const p = id && posiciones[`${tipo}:${id}`];
      if (p) g[clave] = p;
    }
    return { ...g, ...movidos };
  }, [plan, comp, posiciones, movidos]);
  const dibujo = useMemo(() => distribuir(plan, guardadas), [plan, guardadas]);

  // Guardado automático del avance (borrador), un momento después de cada cambio.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (!editable) return;
    const t = setTimeout(async () => {
      setEstadoGuardado("guardando");
      const res = await guardarBorrador(condominioId, { ...r, paso });
      setEstadoGuardado(res.ok ? "guardado" : "error");
    }, 900);
    return () => clearTimeout(t);
  }, [r, paso, condominioId, editable]);

  const cambiar = (f: (x: Respuestas) => Respuestas) => {
    setEstadoGuardado("pendiente");
    setR((x) => ajustar(f(structuredClone(x))));
  };

  function elegirTipo(tipo: TipoGenerador) {
    if (tipo === r.tipo) return;
    if (comp.reutilizar.unidades > 0 || generadoEn) {
      const ok = window.confirm(
        `Esta comunidad ya tiene ${comp.reutilizar.unidades + comp.fuera.unidades.length} unidades en Convive. Cambiar el tipo no borra nada: las unidades que no correspondan quedarán "fuera del plan" y se conservan con su historial. ¿Cambiar el tipo?`,
      );
      if (!ok) return;
    }
    cambiar((x) => ({ ...x, tipo }));
  }

  async function moverElementos(cambios: Record<string, { x: number; y: number }>) {
    setMovidos((m) => ({ ...m, ...cambios }));
    const items = Object.entries(cambios).flatMap(([clave, p]) => {
      const el = dibujo.elementos.find((e) => e.clave === clave);
      const id = comp.ids[clave];
      return el && id ? [{ tipo: tipoRegistro(el.clase), registroId: id, ...p }] : [];
    });
    if (items.length && editable) {
      const res = await guardarPosiciones(condominioId, items);
      if (!res.ok) setMensaje({ ok: false, texto: res.mensaje });
    }
  }

  function confirmar() {
    iniciar(async () => {
      setMensaje(null);
      const res = await generar(condominioId, { ...r, paso }, movidos);
      setMensaje({ ok: res.ok, texto: res.mensaje });
      if (res.ok) {
        setMovidos({});
        router.refresh();
      }
    });
  }

  function reordenar() {
    if (!window.confirm("¿Volver a la distribución automática? Solo cambia el dibujo; no se modifica ningún dato.")) return;
    iniciar(async () => {
      const res = await ordenarAutomaticamente(condominioId);
      setMovidos({});
      setMensaje({ ok: res.ok, texto: res.mensaje });
      router.refresh();
    });
  }

  const porCrear = comp.crear.unidades.length + comp.crear.agrupaciones.length + comp.crear.espacios.length + comp.crear.instalaciones.length;
  const porCambiar = comp.renumerar.length + comp.ubicar.length;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* Vista en planta: arriba en el celular, a la derecha en el computador. */}
      <div className="order-1 min-w-0 lg:order-2">
        <div className="lg:sticky lg:top-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-convive-oscuro">Vista en planta</span>
            <span className="text-texto-suave">
              {[
                resumen.torres && `${resumen.torres} ${resumen.torres === 1 ? "torre" : "torres"}`,
                resumen.deptos && `${resumen.deptos} deptos`,
                resumen.sectores && `${resumen.sectores} ${resumen.sectores === 1 ? "sector" : "sectores"}`,
                resumen.casas && `${resumen.casas} casas`,
                resumen.est && `${resumen.est} estac.`,
                resumen.bod && `${resumen.bod} bodegas`,
                resumen.instalaciones && `${resumen.instalaciones} accesos e instalaciones`,
              ]
                .filter(Boolean)
                .join(" · ") || "Responde las preguntas para ver la comunidad"}
            </span>
          </div>
          <div className="h-[22rem] sm:h-[28rem] lg:h-[calc(100vh-14rem)] lg:min-h-[30rem]">
            <PlanoComunidad
              elementos={dibujo.elementos}
              marcos={dibujo.marcos}
              alto={dibujo.alto}
              creados={creados}
              seleccion={seleccion}
              onSeleccionar={setSeleccion}
              onMover={moverElementos}
              puedeMover={editable}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-texto-suave">
            <span>Esquema sin escala. Arrastra para desplazarte; usa + y − para acercar. Toca un elemento para ver su información.</span>
            {editable && Object.keys(posiciones).length > 0 && (
              <button type="button" onClick={reordenar} className="font-semibold text-marca underline">
                Ordenar automáticamente
              </button>
            )}
          </div>
          {seleccion && (
            <Ficha
              clave={seleccion}
              r={r}
              plan={plan}
              ids={comp.ids}
              condominioId={condominioId}
              editable={editable}
              onCerrar={() => setSeleccion(null)}
              onSeleccionar={setSeleccion}
              onRenombrar={(clave, valor, automatico) =>
                cambiar((x) => {
                  if (!valor.trim() || valor.trim() === automatico) delete x.renombres[clave];
                  else x.renombres[clave] = valor.trim();
                  return x;
                })
              }
            />
          )}
        </div>
      </div>

      {/* Preguntas */}
      <div className="order-2 min-w-0 lg:order-1">
        <nav aria-label="Pasos del asistente" className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {PASOS.map((p, i) => (
            <button
              key={p}
              type="button"
              disabled={i > 0 && !r.tipo}
              onClick={() => setPaso(i)}
              aria-current={paso === i ? "step" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                paso === i ? "border-marca bg-marca text-white" : "border-borde bg-white text-convive-oscuro hover:border-convive"
              }`}
            >
              {i + 1}. {p}
            </button>
          ))}
        </nav>

        <div className="sombra-convive rounded-2xl border border-borde bg-white p-5">
          <fieldset disabled={!editable} className="grid gap-5">
            {paso === 0 && <PasoTipo r={r} elegir={elegirTipo} />}
            {paso === 1 && <PasoEstructura r={r} cambiar={cambiar} />}
            {paso === 2 && <PasoNumeracion r={r} cambiar={cambiar} plan={plan} />}
            {paso === 3 && <PasoEspacios r={r} cambiar={cambiar} />}
            {paso === 4 && <PasoInstalaciones r={r} cambiar={cambiar} />}
          </fieldset>
          {paso === 5 && (
            <PasoRevisar
              plan={plan}
              comp={comp}
              financiera={financiera}
              editable={editable}
              porCrear={porCrear}
              porCambiar={porCambiar}
              pendiente={pendiente}
              confirmar={confirmar}
              seleccionar={setSeleccion}
              condominioId={condominioId}
            />
          )}
          {mensaje && (
            <div className="mt-4">
              <Mensaje tipo={mensaje.ok ? "ok" : "error"} texto={mensaje.texto} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-4">
            <Boton type="button" variante="secundario" disabled={paso === 0} onClick={() => setPaso((p) => p - 1)}>
              <ChevronLeft className="size-4" /> Anterior
            </Boton>
            {editable && (
              <span className="flex items-center gap-1 text-xs text-texto-suave" aria-live="polite">
                {estadoGuardado === "guardado" && (
                  <>
                    <Check className="size-3.5 text-exito" /> Avance guardado
                  </>
                )}
                {estadoGuardado === "pendiente" && "Cambios sin guardar…"}
                {estadoGuardado === "guardando" && (
                  <>
                    <Save className="size-3.5" /> Guardando…
                  </>
                )}
                {estadoGuardado === "error" && <span className="text-peligro">No se pudo guardar</span>}
              </span>
            )}
            {paso < PASOS.length - 1 && (
              <Boton type="button" disabled={!r.tipo} onClick={() => setPaso((p) => p + 1)}>
                Siguiente <ChevronRight className="size-4" />
              </Boton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Componentes de las preguntas ───────────────────────────────────────────

function Pregunta({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-convive-oscuro">{titulo}</p>
      {ayuda && <p className="mb-2 text-xs text-texto-suave">{ayuda}</p>}
      <div className={ayuda ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function Numero({
  valor,
  onCambio,
  min = 0,
  max,
  etiqueta,
  ancho = "w-24",
}: {
  valor: number;
  onCambio: (n: number) => void;
  min?: number;
  max: number;
  etiqueta?: string;
  ancho?: string;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [previo, setPrevio] = useState(valor);
  if (previo !== valor) {
    setPrevio(valor);
    setTexto(String(valor));
  }
  return (
    <label className="inline-flex flex-col gap-1 text-xs text-texto-suave">
      {etiqueta}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onCambio(Math.min(max, Math.max(min, Math.trunc(n))));
        }}
        onBlur={() => setTexto(String(valor))}
        className={`min-h-11 rounded-xl border border-borde bg-white px-3 text-base text-texto focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm ${ancho}`}
      />
    </label>
  );
}

function Texto({ valor, onCambio, etiqueta, ancho = "w-28", max = 40, placeholder }: { valor: string; onCambio: (s: string) => void; etiqueta?: string; ancho?: string; max?: number; placeholder?: string }) {
  return (
    <label className="inline-flex flex-col gap-1 text-xs text-texto-suave">
      {etiqueta}
      <input
        value={valor}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onCambio(e.target.value)}
        className={`min-h-11 rounded-xl border border-borde bg-white px-3 text-base text-texto focus:border-convive focus:outline-none focus:ring-2 focus:ring-convive/25 md:text-sm ${ancho}`}
      />
    </label>
  );
}

function Opciones<T extends string>({ valor, opciones, onCambio }: { valor: T; opciones: { valor: T; texto: string; ayuda?: string }[]; onCambio: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onCambio(o.valor)}
          className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm ${
            valor === o.valor ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white text-texto hover:border-convive"
          }`}
        >
          {o.texto}
          {o.ayuda && <span className="block text-xs font-normal text-texto-suave">{o.ayuda}</span>}
        </button>
      ))}
    </div>
  );
}

type Cambiar = (f: (x: Respuestas) => Respuestas) => void;

function PasoTipo({ r, elegir }: { r: Respuestas; elegir: (t: TipoGenerador) => void }) {
  const iconos = { CASAS: Home, EDIFICIOS: Building2, MIXTA: LayoutGrid };
  return (
    <Pregunta titulo="¿Cómo está compuesta la comunidad?" ayuda="Puedes cambiarlo después: cambiar el tipo nunca borra unidades ya creadas.">
      <div className="grid gap-3">
        {(Object.keys(TIPOS_GENERADOR) as TipoGenerador[]).map((t) => {
          const Icono = iconos[t];
          const activo = r.tipo === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => elegir(t)}
              aria-pressed={activo}
              className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${
                activo ? "border-marca bg-marca-suave ring-2 ring-marca/30" : "border-borde bg-white hover:border-convive"
              }`}
            >
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${activo ? "bg-marca text-white" : "bg-convive-suave text-marca"}`}>
                <Icono className="size-6" />
              </span>
              <span>
                <span className="block font-bold text-convive-oscuro">{TIPOS_GENERADOR[t].texto}</span>
                <span className="block text-sm text-texto-suave">{TIPOS_GENERADOR[t].ayuda}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Pregunta>
  );
}

function PasoEstructura({ r, cambiar }: { r: Respuestas; cambiar: Cambiar }) {
  const casas = r.tipo === "CASAS" || r.tipo === "MIXTA";
  const edificios = r.tipo === "EDIFICIOS" || r.tipo === "MIXTA";
  return (
    <>
      <h2 className="text-lg font-bold text-convive-oscuro">Grupo A · Estructura general</h2>
      {casas && <EstructuraCasas r={r} cambiar={cambiar} />}
      {casas && edificios && <hr className="border-borde" />}
      {edificios && <EstructuraEdificios r={r} cambiar={cambiar} />}
      <hr className="border-borde" />
      <Pregunta titulo="¿Cuántos accesos tiene la comunidad?" ayuda="Portones o entradas. Se crean como instalaciones que podrás completar después.">
        <Numero valor={r.accesos} max={LIMITES.accesos} onCambio={(n) => cambiar((x) => ({ ...x, accesos: n }))} />
      </Pregunta>
    </>
  );
}

function EstructuraCasas({ r, cambiar }: { r: Respuestas; cambiar: Cambiar }) {
  const c = r.casas;
  return (
    <div className="grid gap-4">
      <Pregunta titulo="¿Cuántas casas existen?">
        <Numero
          valor={c.cantidad}
          max={LIMITES.casas}
          onCambio={(n) =>
            cambiar((x) => {
              x.casas.cantidad = n;
              if (x.casas.conSectores) x.casas = cambiarSectores(x.casas, x.casas.sectores.length);
              return x;
            })
          }
        />
      </Pregunta>
      <Pregunta titulo="¿Se distribuyen en sectores o etapas?" ayuda="También sirve para distintos tipos o agrupaciones de casas.">
        <Opciones
          valor={c.conSectores ? "si" : "no"}
          opciones={[
            { valor: "no", texto: "No" },
            { valor: "si", texto: "Sí, en sectores" },
          ]}
          onCambio={(v) =>
            cambiar((x) => {
              x.casas.conSectores = v === "si";
              if (v === "si") x.casas = cambiarSectores(x.casas, Math.max(2, x.casas.sectores.length));
              return x;
            })
          }
        />
      </Pregunta>
      {c.conSectores && (
        <>
          <Pregunta titulo="¿Cuántos sectores existen?">
            <div className="flex flex-wrap items-end gap-3">
              <Numero valor={c.sectores.length} min={1} max={LIMITES.sectores} onCambio={(n) => cambiar((x) => ({ ...x, casas: cambiarSectores(x.casas, n) }))} />
              <Boton
                type="button"
                variante="secundario"
                onClick={() => cambiar((x) => ({ ...x, casas: { ...x.casas, sectores: x.casas.sectores.map((s, i, a) => ({ ...s, casas: repartir(x.casas.cantidad, a.length)[i] })) } }))}
              >
                Repartir en partes iguales
              </Boton>
            </div>
          </Pregunta>
          <div className="grid gap-2">
            {c.sectores.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl bg-fondo p-2">
                <Texto etiqueta={`Sector ${i + 1}: nombre`} valor={s.nombre} onCambio={(v) => cambiar((x) => ((x.casas.sectores[i].nombre = v), x))} />
                <Texto etiqueta="Prefijo" ancho="w-20" max={8} valor={s.prefijo} onCambio={(v) => cambiar((x) => ((x.casas.sectores[i].prefijo = v), x))} />
                <Numero etiqueta="Casas" valor={s.casas} max={LIMITES.casas} onCambio={(n) => cambiar((x) => ((x.casas.sectores[i].casas = n), x))} />
              </div>
            ))}
            <p className="text-xs text-texto-suave">Total: {c.cantidad} casas.</p>
          </div>
        </>
      )}
      {!c.conSectores && r.tipo === "MIXTA" && <p className="text-xs text-texto-suave">En una comunidad mixta las casas quedan en un sector llamado “Casas”.</p>}
    </div>
  );
}

function EstructuraEdificios({ r, cambiar }: { r: Respuestas; cambiar: Cambiar }) {
  const e = r.edificios;
  const setTorre = (i: number, f: (t: Torre) => void) => cambiar((x) => (f(x.edificios.torres[i]), x));
  return (
    <div className="grid gap-4">
      <Pregunta titulo="¿Cuántas torres o edificios existen?">
        <Numero valor={e.cantidad} min={1} max={LIMITES.torres} onCambio={(n) => cambiar((x) => ((x.edificios.cantidad = n), x))} />
      </Pregunta>
      {e.cantidad > 1 && (
        <Pregunta titulo="¿Todas las torres tienen la misma estructura básica?" ayuda="Pisos y departamentos por piso. Después puedes marcar excepciones en una torre o en un piso.">
          <Opciones
            valor={e.iguales ? "si" : "no"}
            opciones={[
              { valor: "si", texto: "Sí, configuro una torre modelo" },
              { valor: "no", texto: "No, son diferentes" },
            ]}
            onCambio={(v) => cambiar((x) => ((x.edificios.iguales = v === "si"), x))}
          />
        </Pregunta>
      )}
      {e.iguales && (
        <Pregunta titulo={e.cantidad > 1 ? "Torre modelo (se replica en todas)" : "Estructura de la torre"}>
          <div className="flex flex-wrap gap-3">
            <Numero etiqueta="Pisos" valor={e.modelo.pisos} min={1} max={LIMITES.pisos} onCambio={(n) => cambiar((x) => ((x.edificios.modelo.pisos = n), x))} />
            <Numero etiqueta="Deptos. por piso" valor={e.modelo.deptosPorPiso} min={1} max={LIMITES.deptosPorPiso} onCambio={(n) => cambiar((x) => ((x.edificios.modelo.deptosPorPiso = n), x))} />
            <Numero etiqueta="Subterráneos" valor={e.modelo.subterraneos} max={LIMITES.subterraneos} onCambio={(n) => cambiar((x) => ((x.edificios.modelo.subterraneos = n), x))} />
          </div>
        </Pregunta>
      )}
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-convive-oscuro">{e.iguales ? "Nombre de cada torre y excepciones" : "Cada torre"}</p>
        {e.torres.map((t, i) => (
          <details key={i} className="rounded-xl bg-fondo p-2" open={!e.iguales && e.torres.length <= 3}>
            <summary className="cursor-pointer text-sm font-semibold">
              Torre {t.nombre || i + 1} · {t.pisos} pisos · {Array.from({ length: t.pisos }, (_, p) => deptosDelPiso(t, p + 1)).reduce((s, n) => s + n, 0)} deptos
              {t.excepciones.length > 0 && ` · ${t.excepciones.length} ${t.excepciones.length === 1 ? "excepción" : "excepciones"}`}
            </summary>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Texto etiqueta="Nombre" valor={t.nombre} onCambio={(v) => setTorre(i, (x) => (x.nombre = v))} />
              <Texto etiqueta="Prefijo" ancho="w-20" max={8} valor={t.prefijo} onCambio={(v) => setTorre(i, (x) => (x.prefijo = v))} />
              {!e.iguales && (
                <>
                  <Numero etiqueta="Pisos" valor={t.pisos} min={1} max={LIMITES.pisos} onCambio={(n) => setTorre(i, (x) => (x.pisos = n))} />
                  <Numero etiqueta="Deptos./piso" valor={t.deptosPorPiso} min={1} max={LIMITES.deptosPorPiso} onCambio={(n) => setTorre(i, (x) => (x.deptosPorPiso = n))} />
                  <Numero etiqueta="Subterráneos" valor={t.subterraneos} max={LIMITES.subterraneos} onCambio={(n) => setTorre(i, (x) => (x.subterraneos = n))} />
                </>
              )}
            </div>
            <div className="mt-3 grid gap-2">
              <p className="text-xs text-texto-suave">Pisos con distinta cantidad de departamentos:</p>
              {t.excepciones.map((x, k) => (
                <div key={k} className="flex flex-wrap items-end gap-2">
                  <Numero etiqueta="Piso" valor={x.piso} min={1} max={t.pisos} onCambio={(n) => setTorre(i, (tt) => (tt.excepciones[k].piso = n))} />
                  <Numero etiqueta="Deptos." valor={x.unidades} max={LIMITES.deptosPorPiso} onCambio={(n) => setTorre(i, (tt) => (tt.excepciones[k].unidades = n))} />
                  <button type="button" className="min-h-11 px-2 text-sm text-peligro underline" onClick={() => setTorre(i, (tt) => tt.excepciones.splice(k, 1))}>
                    Quitar
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="justify-self-start text-sm font-semibold text-marca underline"
                onClick={() => setTorre(i, (tt) => tt.excepciones.push({ piso: Math.min(tt.pisos, 1), unidades: Math.max(0, tt.deptosPorPiso - 1) }))}
              >
                + Agregar excepción
              </button>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function PasoNumeracion({ r, cambiar, plan }: { r: Respuestas; cambiar: Cambiar; plan: ReturnType<typeof planificar> }) {
  const casas = r.tipo === "CASAS" || r.tipo === "MIXTA";
  const edificios = r.tipo === "EDIFICIOS" || r.tipo === "MIXTA";
  const muestra = (grupo: string) => {
    const us = plan.unidades.filter((u) => u.grupo === grupo);
    if (!us.length) return "sin unidades";
    return us.length <= 4 ? us.map((u) => u.numero).join(", ") : `${us.slice(0, 3).map((u) => u.numero).join(", ")} … ${us[us.length - 1].numero}`;
  };
  const nc = r.casas.numeracion;
  const ne = r.edificios.numeracion;
  return (
    <>
      <h2 className="text-lg font-bold text-convive-oscuro">Grupo B · Numeración automática</h2>
      <p className="-mt-3 text-xs text-texto-suave">
        El número visible se puede cambiar después sin perder el historial: cada unidad tiene además un identificador interno permanente.
      </p>
      {casas && (
        <div className="grid gap-3">
          <Pregunta titulo="¿Cómo se numeran las casas?">
            <Opciones
              valor={nc.esquema}
              opciones={[
                { valor: "CORRELATIVO", texto: "Correlativa", ayuda: "1, 2, 3… en toda la comunidad" },
                { valor: "POR_SECTOR", texto: "Por sector", ayuda: "A-01, A-02, B-01…" },
              ]}
              onCambio={(v) => cambiar((x) => ((x.casas.numeracion.esquema = v), x))}
            />
          </Pregunta>
          <div className="flex flex-wrap gap-3">
            <Texto etiqueta="Texto antes del número" placeholder="Ej.: Casa " valor={nc.prefijo} max={12} onCambio={(v) => cambiar((x) => ((x.casas.numeracion.prefijo = v), x))} />
            <Numero etiqueta="Empieza en" valor={nc.inicio} max={99999} onCambio={(n) => cambiar((x) => ((x.casas.numeracion.inicio = n), x))} />
            <Numero etiqueta="Ceros (dígitos)" valor={nc.digitos} max={5} onCambio={(n) => cambiar((x) => ((x.casas.numeracion.digitos = n), x))} />
            {nc.esquema === "POR_SECTOR" && <Texto etiqueta="Separador" ancho="w-16" max={2} valor={nc.separador} onCambio={(v) => cambiar((x) => ((x.casas.numeracion.separador = v), x))} />}
          </div>
          <Texto etiqueta="Números que no se usan (separados por coma)" ancho="w-full" max={500} placeholder="Ej.: 13" valor={nc.omitir} onCambio={(v) => cambiar((x) => ((x.casas.numeracion.omitir = v), x))} />
          <Vista>
            {plan.bloques
              .filter((b) => b.clase === "SECTOR")
              .map((b) => (
                <li key={b.clave}>
                  <strong>{b.nombre}:</strong> {muestra(b.clave)}
                </li>
              ))}
          </Vista>
        </div>
      )}
      {casas && edificios && <hr className="border-borde" />}
      {edificios && (
        <div className="grid gap-3">
          <Pregunta titulo="¿Cómo se numeran los departamentos?">
            <Opciones
              valor={ne.esquema}
              opciones={[
                { valor: "PISO", texto: "Por piso", ayuda: "101, 102… 201, 202" },
                { valor: "CORRELATIVO", texto: "Correlativa", ayuda: "1, 2, 3, 4…" },
              ]}
              onCambio={(v) => cambiar((x) => ((x.edificios.numeracion.esquema = v), x))}
            />
          </Pregunta>
          <Pregunta titulo="¿Llevan la letra o prefijo de la torre?" ayuda="Si hay varias torres con la misma numeración, el prefijo evita números repetidos.">
            <Opciones
              valor={ne.prefijoTorre ? "si" : "no"}
              opciones={[
                { valor: "si", texto: "Sí: A-101, B-101" },
                { valor: "no", texto: "No: 101" },
              ]}
              onCambio={(v) => cambiar((x) => ((x.edificios.numeracion.prefijoTorre = v === "si"), x))}
            />
          </Pregunta>
          {ne.esquema === "CORRELATIVO" && r.edificios.cantidad > 1 && (
            <Pregunta titulo="¿Cada torre tiene su propia serie?">
              <Opciones
                valor={ne.serie}
                opciones={[
                  { valor: "POR_TORRE", texto: "Sí, cada torre parte de nuevo" },
                  { valor: "GLOBAL", texto: "No, la cuenta sigue" },
                ]}
                onCambio={(v) => cambiar((x) => ((x.edificios.numeracion.serie = v), x))}
              />
            </Pregunta>
          )}
          <div className="flex flex-wrap gap-3">
            <Numero etiqueta={ne.esquema === "PISO" ? "Primer depto. del piso" : "Empieza en"} valor={ne.inicio} max={99999} onCambio={(n) => cambiar((x) => ((x.edificios.numeracion.inicio = n), x))} />
            {ne.esquema === "CORRELATIVO" && <Numero etiqueta="Ceros (dígitos)" valor={ne.digitos} max={5} onCambio={(n) => cambiar((x) => ((x.edificios.numeracion.digitos = n), x))} />}
            {ne.prefijoTorre && <Texto etiqueta="Separador" ancho="w-16" max={2} valor={ne.separador} onCambio={(v) => cambiar((x) => ((x.edificios.numeracion.separador = v), x))} />}
          </div>
          <Texto etiqueta="Números que no se usan (separados por coma)" ancho="w-full" max={500} placeholder="Ej.: 113, 213" valor={ne.omitir} onCambio={(v) => cambiar((x) => ((x.edificios.numeracion.omitir = v), x))} />
          <Vista>
            {plan.bloques
              .filter((b) => b.clase === "TORRE")
              .map((b) => (
                <li key={b.clave}>
                  <strong>Torre {b.nombre}:</strong> {muestra(b.clave)}
                </li>
              ))}
          </Vista>
        </div>
      )}
      <p className="text-xs text-texto-suave">Para corregir un número en particular, toca la unidad en el plano o en el paso “Revisar y crear”.</p>
    </>
  );
}

function Vista({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-convive/50 bg-convive-suave/50 p-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-marca">Vista previa</p>
      <ul className="grid gap-1 text-sm">{children}</ul>
    </div>
  );
}

function BloqueEspacios({ titulo, clase, resp, actualizar, unidad }: { titulo: string; clase: string; resp: RespEspacios; actualizar: (f: (e: RespEspacios) => void) => void; unidad: string }) {
  return (
    <div className="grid gap-3">
      <Pregunta titulo={titulo}>
        <Opciones
          valor={resp.modo}
          opciones={(Object.keys(MODOS_ESPACIOS) as ModoEspacios[]).map((m) => ({ valor: m, texto: MODOS_ESPACIOS[m] }))}
          onCambio={(v) => actualizar((e) => (e.modo = v))}
        />
      </Pregunta>
      {resp.modo === "TODOS" && (
        <label className="flex items-start gap-2 rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
          <input type="checkbox" className="mt-1" checked={resp.proponerVinculo} onChange={(e) => actualizar((x) => (x.proponerVinculo = e.target.checked))} />
          <span>
            Proponer {clase === "BODEGA" ? "una bodega" : "un estacionamiento"} para cada {unidad}. Es solo una <strong>propuesta por confirmar</strong>: no se registra propiedad ni asignación de uso. Eso se confirma después en cada ficha.
          </span>
        </label>
      )}
      {resp.modo === "ALGUNOS" && (
        <Pregunta titulo={`¿Cuántos${clase === "BODEGA" ? "as bodegas" : " estacionamientos"} privados hay?`} ayuda="Las asociaciones con cada unidad se configuran después, en la ficha de cada espacio.">
          <Numero valor={resp.cantidad} max={LIMITES.espacios} onCambio={(n) => actualizar((e) => (e.cantidad = n))} />
        </Pregunta>
      )}
      {(resp.modo === "TODOS" || resp.modo === "ALGUNOS") && (
        <div className="flex flex-wrap gap-3">
          <Texto etiqueta="Prefijo" ancho="w-20" max={8} valor={resp.prefijo} onCambio={(v) => actualizar((e) => (e.prefijo = v))} />
          <Numero etiqueta="Empieza en" valor={resp.inicio} max={99999} onCambio={(n) => actualizar((e) => (e.inicio = n))} />
          <Numero etiqueta="Dígitos" valor={resp.digitos} max={5} onCambio={(n) => actualizar((e) => (e.digitos = n))} />
        </div>
      )}
    </div>
  );
}

function PasoEspacios({ r, cambiar }: { r: Respuestas; cambiar: Cambiar }) {
  const unidad = r.tipo === "CASAS" ? "casa" : r.tipo === "MIXTA" ? "unidad" : "departamento";
  const extras: { k: keyof Respuestas["extras"]; texto: string }[] = [
    { k: "visitas", texto: "Estacionamientos de visitas" },
    { k: "accesibles", texto: "Estacionamientos accesibles" },
    { k: "comunes", texto: "Estacionamientos de uso común" },
    { k: "servicio", texto: "Estacionamientos de servicio" },
    { k: "bodegasComunes", texto: "Bodegas comunes" },
  ];
  return (
    <>
      <h2 className="text-lg font-bold text-convive-oscuro">Grupo C · Estacionamientos y bodegas</h2>
      <BloqueEspacios titulo={`¿Los ${unidad}s tienen estacionamiento?`} clase="ESTACIONAMIENTO" unidad={unidad} resp={r.estacionamientos} actualizar={(f) => cambiar((x) => (f(x.estacionamientos), x))} />
      <hr className="border-borde" />
      <BloqueEspacios titulo={`¿Los ${unidad}s tienen bodega?`} clase="BODEGA" unidad={unidad} resp={r.bodegas} actualizar={(f) => cambiar((x) => (f(x.bodegas), x))} />
      <hr className="border-borde" />
      <Pregunta titulo="Espacios independientes" ayuda="De la comunidad o de uso común. Se crean con condición jurídica “por definir”: no se presume de quién son.">
        <div className="grid gap-2 sm:grid-cols-2">
          {extras.map((e) => (
            <div key={e.k} className="flex items-center justify-between gap-2 rounded-xl bg-fondo px-3 py-1">
              <span className="text-sm">{e.texto}</span>
              <Numero valor={r.extras[e.k]} max={500} ancho="w-20" onCambio={(n) => cambiar((x) => ((x.extras[e.k] = n), x))} />
            </div>
          ))}
        </div>
      </Pregunta>
    </>
  );
}

function PasoInstalaciones({ r, cambiar }: { r: Respuestas; cambiar: Cambiar }) {
  return (
    <>
      <h2 className="text-lg font-bold text-convive-oscuro">Espacios comunes e instalaciones</h2>
      <p className="-mt-3 text-xs text-texto-suave">
        Marca lo que tiene la comunidad. Cada uno queda como un registro en Estructura física; sus antecedentes técnicos se completan después. Los estacionamientos de visitas están en el paso anterior.
      </p>
      <div className="grid gap-2">
        {(Object.keys(CATALOGO_INSTALACIONES) as ClaveInstalacion[]).map((k) => {
          const v = r.instalaciones[k];
          return (
            <div key={k} className={`rounded-xl border p-2 ${v ? "border-marca bg-marca-suave/60" : "border-borde"}`}>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={!!v}
                  onChange={(e) =>
                    cambiar((x) => {
                      if (e.target.checked) x.instalaciones[k] = { cantidad: 1, ubicacion: "" };
                      else delete x.instalaciones[k];
                      return x;
                    })
                  }
                />
                {CATALOGO_INSTALACIONES[k].texto}
              </label>
              {v && (
                <div className="mt-1 flex flex-wrap items-end gap-2 pl-6">
                  <Numero etiqueta="Cantidad" valor={v.cantidad} min={1} max={LIMITES.instalacion} ancho="w-20" onCambio={(n) => cambiar((x) => ((x.instalaciones[k]!.cantidad = n), x))} />
                  <Texto etiqueta="Ubicación preliminar (opcional)" ancho="w-56" max={120} placeholder="Ej.: junto al acceso" valor={v.ubicacion} onCambio={(s) => cambiar((x) => ((x.instalaciones[k]!.ubicacion = s), x))} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PasoRevisar({
  plan,
  comp,
  financiera,
  editable,
  porCrear,
  porCambiar,
  pendiente,
  confirmar,
  seleccionar,
  condominioId,
}: {
  plan: ReturnType<typeof planificar>;
  comp: ReturnType<typeof comparar>;
  financiera: boolean;
  editable: boolean;
  porCrear: number;
  porCambiar: number;
  pendiente: boolean;
  confirmar: () => void;
  seleccionar: (c: string) => void;
  condominioId: string;
}) {
  const creados = new Set(Object.keys(comp.ids));
  const bloqueadoFinanciera = financiera && comp.crear.unidades.length > 0;
  const fila = (texto: string, n: number, reusa: number) => (
    <tr>
      <td className="py-1 pr-3">{texto}</td>
      <td className="py-1 pr-3 text-right font-semibold tabular-nums">{n}</td>
      <td className="py-1 text-right tabular-nums text-texto-suave">{reusa}</td>
    </tr>
  );
  return (
    <div className="grid gap-4">
      <h2 className="text-lg font-bold text-convive-oscuro">Revisar y crear</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-texto-suave">
          <tr>
            <th className="text-left font-semibold">Registro</th>
            <th className="text-right font-semibold">Se crean</th>
            <th className="text-right font-semibold">Ya existen</th>
          </tr>
        </thead>
        <tbody>
          {fila("Unidades", comp.crear.unidades.length, comp.reutilizar.unidades)}
          {fila("Torres, sectores, pisos y subterráneos", comp.crear.agrupaciones.length, comp.reutilizar.agrupaciones)}
          {fila("Estacionamientos y bodegas", comp.crear.espacios.length, comp.reutilizar.espacios)}
          {fila("Accesos e instalaciones", comp.crear.instalaciones.length, comp.reutilizar.instalaciones)}
        </tbody>
      </table>

      {comp.errores.map((e) => (
        <p key={e} className="flex gap-2 rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {e}
        </p>
      ))}
      {comp.renumerar.length > 0 && (
        <div className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
          <p className="font-semibold">Cambian de número o nombre ({comp.renumerar.length}). Son los mismos registros: conservan su historial, cobros y vínculos.</p>
          <p className="mt-1 text-xs">
            {comp.renumerar
              .slice(0, 12)
              .map((x) => `${x.de} → ${x.a}`)
              .join(" · ")}
            {comp.renumerar.length > 12 && " …"}
          </p>
        </div>
      )}
      {comp.ubicar.length > 0 && (
        <p className="rounded-xl bg-marca-suave p-3 text-sm text-marca">
          {comp.ubicar.length} unidades que ya existían (por ejemplo, cargadas por Excel) se ubicarán en su torre, piso o sector. No se crean de nuevo.
        </p>
      )}
      {(comp.fuera.unidades.length > 0 || comp.fuera.espacios.length > 0 || comp.fuera.instalaciones.length > 0) && (
        <div className="rounded-xl border border-borde bg-fondo p-3 text-sm">
          <p className="font-semibold">Ya existen y no están en este plan: se conservan, no se borran.</p>
          <p className="mt-1 text-xs text-texto-suave">
            {[
              comp.fuera.unidades.length && `${comp.fuera.unidades.length} unidades (${comp.fuera.unidades.slice(0, 8).map((u) => u.numero).join(", ")}${comp.fuera.unidades.length > 8 ? "…" : ""})`,
              comp.fuera.espacios.length && `${comp.fuera.espacios.length} estacionamientos o bodegas`,
              comp.fuera.instalaciones.length && `${comp.fuera.instalaciones.length} instalaciones`,
            ]
              .filter(Boolean)
              .join(" · ")}
            . Si sobran, revísalas en{" "}
            <Link className="font-semibold text-marca underline" href={`/condominios/${condominioId}/unidades`}>
              Unidades
            </Link>{" "}
            (solo se pueden eliminar las que no tienen historial).
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">Unidades del plan (toca una para corregir su número)</p>
        <div className="grid max-h-72 gap-3 overflow-y-auto rounded-xl border border-borde p-3">
          {plan.bloques.map((b) => {
            const us = plan.unidades.filter((u) => u.grupo === b.clave);
            if (!us.length) return null;
            return (
              <div key={b.clave}>
                <p className="mb-1 text-xs font-bold text-texto-suave">
                  {b.clase === "TORRE" ? `Torre ${b.nombre}` : b.nombre === "Casas" ? "Casas" : `Sector ${b.nombre}`} · {us.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {us.map((u) => (
                    <button
                      key={u.clave}
                      type="button"
                      onClick={() => seleccionar(u.clave)}
                      className={`rounded-md border px-1.5 py-0.5 text-xs tabular-nums ${
                        creados.has(u.clave) ? "border-marca bg-marca-suave text-marca" : "border-dashed border-borde bg-white"
                      } ${u.numero !== u.automatico ? "font-bold text-naranja-texto" : ""}`}
                    >
                      {u.numero}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {!plan.unidades.length && <p className="text-sm text-texto-suave">Aún no hay unidades en el plan.</p>}
        </div>
      </div>

      {comp.crear.unidades.length > 0 && (
        <p className="text-xs text-texto-suave">
          Las unidades nuevas quedan con una <strong>alícuota provisional igual</strong> (100 % repartido en partes iguales). Corrígela en Unidades o con Excel antes de habilitar cobros. La comunidad sigue en configuración: no se emite ningún cobro.
        </p>
      )}
      {bloqueadoFinanciera && (
        <Mensaje texto="Esta comunidad ya emite cobros: el generador no crea unidades nuevas aquí. Agrégalas en Unidades con su alícuota. Sí puedes ordenar el plano." />
      )}

      {editable && (
        <Boton type="button" disabled={pendiente || comp.errores.length > 0 || bloqueadoFinanciera || porCrear + porCambiar === 0} onClick={confirmar}>
          <Layers className="size-4" />
          {pendiente
            ? "Creando…"
            : porCrear + porCambiar === 0
              ? "Todo está creado"
              : porCrear
                ? `Confirmar y crear ${porCrear} registros${porCambiar ? ` (y ${porCambiar} ajustes)` : ""}`
                : `Aplicar ${porCambiar} ajustes`}
        </Boton>
      )}
      {porCrear + porCambiar === 0 && plan.unidades.length > 0 && (
        <p className="text-sm text-exito">
          <Check className="mr-1 inline size-4" />
          Todo lo del plan ya existe en Convive. Volver a confirmar no duplica nada.
        </p>
      )}
    </div>
  );
}

// ── Ficha del elemento seleccionado ────────────────────────────────────────

function Ficha({
  clave,
  r,
  plan,
  ids,
  condominioId,
  editable,
  onCerrar,
  onSeleccionar,
  onRenombrar,
}: {
  clave: string;
  r: Respuestas;
  plan: ReturnType<typeof planificar>;
  ids: Registros;
  condominioId: string;
  editable: boolean;
  onCerrar: () => void;
  onSeleccionar: (c: string) => void;
  onRenombrar: (clave: string, valor: string, automatico: string) => void;
}) {
  const base = `/condominios/${condominioId}`;
  const id = ids[clave];
  const unidad = plan.unidades.find((u) => u.clave === clave);
  const espacio = plan.espacios.find((e) => e.clave === clave);
  const inst = plan.instalaciones.find((i) => i.clave === clave);
  const bloque = plan.bloques.find((b) => b.clave === clave);
  const [piso, setPiso] = useState(1);
  const [valor, setValor] = useState(() => {
    const u = plan.unidades.find((x) => x.clave === clave);
    return u?.numero ?? plan.espacios.find((x) => x.clave === clave)?.codigo ?? plan.instalaciones.find((x) => x.clave === clave)?.nombre ?? plan.bloques.find((x) => x.clave === clave)?.nombre ?? "";
  });

  let titulo = "";
  let etiqueta = "";
  let automatico = "";
  let ficha: string | null = null;
  const detalles: string[] = [];
  if (unidad) {
    titulo = unidad.tipo === "CASA" ? "Casa" : "Departamento";
    etiqueta = unidad.numero;
    automatico = unidad.automatico;
    const b = plan.bloques.find((x) => x.clave === unidad.grupo);
    if (b) detalles.push(b.clase === "TORRE" ? `Torre ${b.nombre}` : b.nombre === "Casas" ? "Casas" : `Sector ${b.nombre}`);
    if (unidad.piso) detalles.push(`Piso ${unidad.piso}`);
    if (unidad.numero !== unidad.automatico) detalles.push(`Número automático: ${unidad.automatico}`);
    if (id) ficha = `${base}/unidades/${id}`;
  } else if (espacio) {
    titulo = espacio.clase === "BODEGA" ? "Bodega" : "Estacionamiento";
    etiqueta = espacio.codigo;
    automatico = espacio.codigo;
    detalles.push(espacio.destino === "VISITAS" ? "Visitas" : espacio.destino === "USO_COMUN" ? "Uso común" : espacio.destino === "SERVICIO" ? "Servicio" : espacio.destino === "PRIVADO" ? "Privado" : "Destino por definir");
    if (espacio.accesible) detalles.push("Accesible");
    detalles.push("Condición jurídica: por definir");
    if (espacio.nota) detalles.push(espacio.nota);
    if (id) ficha = `${base}/estructura/espacios/${id}`;
  } else if (inst) {
    titulo = inst.acceso ? "Acceso" : "Instalación o espacio común";
    etiqueta = inst.nombre;
    automatico = inst.nombre;
    detalles.push(`Código ${inst.codigo}`);
    if (inst.ubicacion) detalles.push(inst.ubicacion);
    if (id) ficha = `${base}/estructura/instalaciones/${id}`;
  } else if (bloque) {
    titulo = bloque.clase === "TORRE" ? "Torre" : "Sector";
    etiqueta = bloque.nombre;
    automatico = bloque.clase === "TORRE" ? (r.edificios.torres[Number(clave.slice(1)) - 1]?.nombre ?? "") : (r.casas.sectores[Number(clave.slice(1)) - 1]?.nombre ?? "");
    if (id) ficha = `${base}/estructura`;
  }

  const [previo, setPrevio] = useState(`${clave}|${etiqueta}`);
  if (previo !== `${clave}|${etiqueta}`) {
    setPrevio(`${clave}|${etiqueta}`);
    setValor(etiqueta);
  }
  if (!titulo) return null;
  const torre = bloque?.clase === "TORRE" ? r.edificios.torres[Number(clave.slice(1)) - 1] : undefined;
  const deptosPiso = torre ? plan.unidades.filter((u) => u.grupo === clave && u.piso === piso) : [];

  return (
    <div className="sombra-convive mt-3 rounded-2xl border border-borde bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">{titulo}</p>
          <p className="text-lg font-bold text-convive-oscuro">{etiqueta}</p>
          <p className="mt-0.5">{id ? <Insignia tono="exito">Creado en Convive</Insignia> : <Insignia tono="alerta">Propuesto: aún no se crea</Insignia>}</p>
        </div>
        <button type="button" onClick={onCerrar} className="text-sm text-texto-suave underline">
          Cerrar
        </button>
      </div>
      {detalles.length > 0 && <p className="mt-2 text-sm text-texto-suave">{detalles.join(" · ")}</p>}

      {torre && (
        <div className="mt-3">
          <p className="mb-1 text-sm font-semibold">Pisos de la torre</p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: torre.subterraneos }, (_, i) => -(torre.subterraneos - i)).map((p) => (
              <span key={p} className="rounded-md border border-dashed border-borde px-2 py-1 text-xs text-texto-suave">
                S{p}
              </span>
            ))}
            {Array.from({ length: torre.pisos }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPiso(p)}
                className={`min-w-9 rounded-md border px-2 py-1 text-xs font-semibold ${piso === p ? "border-marca bg-marca text-white" : "border-borde bg-white"}`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 rounded-xl border border-borde bg-fondo p-2">
            <p className="mb-1 text-xs text-texto-suave">Planta del piso {piso} (esquema)</p>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.ceil(deptosPiso.length / 2))}, minmax(0, 1fr))` }}>
              {deptosPiso.map((u) => (
                <button
                  key={u.clave}
                  type="button"
                  onClick={() => onSeleccionar(u.clave)}
                  className={`rounded-md border px-1 py-3 text-xs font-bold ${ids[u.clave] ? "border-marca bg-marca-suave text-marca" : "border-dashed border-marca/60 bg-white text-marca"} `}
                >
                  {u.numero}
                </button>
              ))}
              {deptosPiso.length === 0 && <span className="text-xs text-texto-suave">Piso sin departamentos.</span>}
            </div>
            {deptosPiso.length > 1 && <p className="mt-1 text-center text-[10px] uppercase tracking-widest text-texto-suave">pasillo y ascensor</p>}
          </div>
        </div>
      )}

      {editable && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onRenombrar(clave, valor, automatico);
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-texto-suave">
            {unidad || espacio ? "Cambiar número" : "Cambiar nombre"}
            <input
              value={valor}
              maxLength={40}
              onChange={(e) => setValor(e.target.value)}
              className="min-h-11 w-40 rounded-xl border border-borde px-3 text-base text-texto md:text-sm"
            />
          </label>
          <Boton type="submit" variante="secundario" disabled={!valor.trim() || valor.trim() === etiqueta}>
            Cambiar
          </Boton>
          {id && <p className="w-full text-xs text-texto-suave">Como ya existe, el cambio se aplica al confirmar en “Revisar y crear”. Conserva su historial.</p>}
        </form>
      )}

      {ficha && (
        <Link href={ficha} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-marca underline">
          Abrir ficha administrativa <ExternalLink className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
