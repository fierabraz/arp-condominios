"use client";

// COM-001-VIS · Vista esquemática en planta (no es un plano a escala). Dibuja torres, casas,
// estacionamientos, bodegas, accesos e instalaciones; permite seleccionar, mover, acercar,
// alejar y desplazarse. Los elementos con borde punteado aún no existen en Convive.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Maximize2, Minus, Move, Plus } from "lucide-react";
import { ANCHO_PLANO, cajaDe, type ElementoDibujo, type Marco } from "@/lib/generador";

const COLORES: Record<ElementoDibujo["clase"], { relleno: string; borde: string; texto: string }> = {
  TORRE: { relleno: "#e8f4f1", borde: "#00666a", texto: "#004b4e" },
  CASA: { relleno: "#fff3ea", borde: "#d9772f", texto: "#8a3b00" },
  ESTACIONAMIENTO: { relleno: "#eef1f4", borde: "#64748b", texto: "#334155" },
  BODEGA: { relleno: "#f5efe6", borde: "#8b6b3e", texto: "#5b4526" },
  INSTALACION: { relleno: "#e6f4ea", borde: "#1f6b35", texto: "#1f6b35" },
  ACCESO: { relleno: "#1c2b2a", borde: "#1c2b2a", texto: "#ffffff" },
};

type Vista = { x: number; y: number; w: number };

type Arrastre =
  | { modo: "pan"; inicio: { x: number; y: number }; vista: Vista; movio: boolean }
  | { modo: "mover"; claves: string[]; inicio: { x: number; y: number }; origen: Record<string, { x: number; y: number }>; movio: boolean; clave: string };

export function PlanoComunidad({
  elementos,
  marcos,
  alto,
  creados,
  seleccion,
  onSeleccionar,
  onMover,
  puedeMover,
}: {
  elementos: ElementoDibujo[];
  marcos: Marco[];
  alto: number;
  /** Claves que ya son registros de Convive (las demás se ven punteadas). */
  creados: Set<string>;
  seleccion: string | null;
  onSeleccionar: (clave: string | null) => void;
  onMover: (cambios: Record<string, { x: number; y: number }>) => void;
  puedeMover: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [vista, setVista] = useState<Vista>({ x: 0, y: 0, w: ANCHO_PLANO });
  const [modoMover, setModoMover] = useState(false);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [desfase, setDesfase] = useState<{ claves: Set<string>; dx: number; dy: number } | null>(null);
  const [aspecto, setAspecto] = useState(0.65);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setAspecto(r.height / r.width);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    // La rueda del ratón acerca y aleja (sin desplazar la página).
    const rueda = (e: WheelEvent) => {
      e.preventDefault();
      const p = aPlano(e.clientX, e.clientY);
      zoom(e.deltaY < 0 ? 0.85 : 1.18, p);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => {
      obs.disconnect();
      el.removeEventListener("wheel", rueda);
    };
  });

  const h = vista.w * aspecto;

  function aPlano(cx: number, cy: number) {
    const el = svg.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: vista.x + ((cx - r.left) / r.width) * vista.w, y: vista.y + ((cy - r.top) / r.height) * h };
  }

  function zoom(factor: number, centro?: { x: number; y: number }) {
    setVista((v) => {
      const w = Math.min(4000, Math.max(120, v.w * factor));
      const c = centro ?? { x: v.x + v.w / 2, y: v.y + (v.w * aspecto) / 2 };
      return { w, x: c.x - ((c.x - v.x) * w) / v.w, y: c.y - ((c.y - v.y) * w) / v.w };
    });
  }

  function ajustar() {
    setVista({ x: 0, y: 0, w: Math.max(ANCHO_PLANO, alto / aspecto) });
  }

  function empezar(e: RPointerEvent, clave?: string, marco?: string) {
    const p = aPlano(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (modoMover && puedeMover && (clave || marco)) {
      const claves = marco ? elementos.filter((x) => x.marco === marco).map((x) => x.clave) : [clave!];
      const origen = Object.fromEntries(elementos.filter((x) => claves.includes(x.clave)).map((x) => [x.clave, { x: x.x, y: x.y }]));
      setArrastre({ modo: "mover", claves, inicio: p, origen, movio: false, clave: clave ?? "" });
    } else {
      setArrastre({ modo: "pan", inicio: { x: e.clientX, y: e.clientY }, vista, movio: false });
    }
    e.stopPropagation();
  }

  function mover(e: RPointerEvent) {
    if (!arrastre) return;
    if (arrastre.modo === "pan") {
      const el = svg.current!;
      const r = el.getBoundingClientRect();
      const dx = ((e.clientX - arrastre.inicio.x) / r.width) * arrastre.vista.w;
      const dy = ((e.clientY - arrastre.inicio.y) / r.height) * arrastre.vista.w * aspecto;
      if (Math.abs(e.clientX - arrastre.inicio.x) + Math.abs(e.clientY - arrastre.inicio.y) > 4) arrastre.movio = true;
      setVista({ ...arrastre.vista, x: arrastre.vista.x - dx, y: arrastre.vista.y - dy });
    } else {
      const p = aPlano(e.clientX, e.clientY);
      const dx = p.x - arrastre.inicio.x;
      const dy = p.y - arrastre.inicio.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) arrastre.movio = true;
      setDesfase({ claves: new Set(arrastre.claves), dx, dy });
    }
  }

  function terminar(clave?: string) {
    if (!arrastre) return;
    if (arrastre.modo === "mover" && arrastre.movio && desfase) {
      const cambios: Record<string, { x: number; y: number }> = {};
      for (const c of arrastre.claves) {
        const o = arrastre.origen[c];
        cambios[c] = { x: Math.round(o.x + desfase.dx), y: Math.round(o.y + desfase.dy) };
      }
      onMover(cambios);
    } else if (!arrastre.movio) {
      onSeleccionar(clave ?? (arrastre.modo === "mover" ? arrastre.clave || null : null));
    }
    setArrastre(null);
    setDesfase(null);
  }

  const pos = (e: ElementoDibujo) => (desfase?.claves.has(e.clave) ? { x: e.x + desfase.dx, y: e.y + desfase.dy } : { x: e.x, y: e.y });
  const dibujados = elementos.map((e) => ({ ...e, ...pos(e) }));
  const fuente = (e: ElementoDibujo) => Math.max(7, Math.min(13, e.w / Math.max(4, e.etiqueta.length * 0.62)));

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-2xl border border-borde bg-[#fbfdfc]">
      <svg
        ref={svg}
        role="img"
        aria-label="Vista en planta de la comunidad"
        className={`h-full w-full touch-none ${arrastre?.modo === "pan" ? "cursor-grabbing" : modoMover ? "cursor-default" : "cursor-grab"}`}
        viewBox={`${vista.x} ${vista.y} ${vista.w} ${h}`}
        onPointerDown={(e) => empezar(e)}
        onPointerMove={mover}
        onPointerUp={() => terminar()}
        onPointerCancel={() => {
          setArrastre(null);
          setDesfase(null);
        }}
      >
        <defs>
          <pattern id="cuadricula" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e7efed" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={-5000} y={-5000} width={20000} height={60000} fill="url(#cuadricula)" />
        <rect x={10} y={8} width={ANCHO_PLANO - 20} height={Math.max(alto - 8, 200)} rx={18} fill="none" stroke="#b9d3ce" strokeWidth={2} strokeDasharray="8 6" />

        {marcos.map((m) => {
          const c = cajaDe(dibujados, m.clave);
          if (!c) return null;
          return (
            <g key={m.clave} onPointerDown={(e) => empezar(e, undefined, m.clave)} onPointerUp={(e) => { e.stopPropagation(); terminar(); }} className={modoMover && puedeMover ? "cursor-move" : ""}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={12} fill={m.clase === "SECTOR" ? "#fffaf5" : "#f7f9fb"} stroke={m.clase === "SECTOR" ? "#f0b88a" : "#cbd5e1"} strokeWidth={1.5} />
              <text x={c.x + 12} y={c.y + 21} fontSize={13} fontWeight={700} fill={m.clase === "SECTOR" ? "#8a3b00" : "#334155"}>
                {m.clase === "SECTOR" ? (m.nombre.toLowerCase().startsWith("sector") || m.nombre === "Casas" ? m.nombre : `Sector ${m.nombre}`) : m.nombre}
              </text>
            </g>
          );
        })}

        {dibujados.map((e) => {
          const col = COLORES[e.clase];
          const creado = creados.has(e.clave);
          const sel = seleccion === e.clave;
          const redondeo = e.clase === "INSTALACION" ? 14 : e.clase === "ACCESO" ? 15 : e.clase === "CASA" ? 4 : 6;
          return (
            <g
              key={e.clave}
              data-clave={e.clave}
              onPointerDown={(ev) => empezar(ev, e.clave)}
              onPointerUp={(ev) => {
                ev.stopPropagation();
                terminar(e.clave);
              }}
              className={modoMover && puedeMover ? "cursor-move" : "cursor-pointer"}
            >
              <title>{`${e.etiqueta}${e.detalle ? ` · ${e.detalle}` : ""}${creado ? "" : " (propuesto)"}`}</title>
              <rect
                x={e.x}
                y={e.y}
                width={e.w}
                height={e.h}
                rx={redondeo}
                fill={col.relleno}
                fillOpacity={creado ? 1 : 0.7}
                stroke={sel ? "#ff7a1a" : col.borde}
                strokeWidth={sel ? 4 : creado ? 1.6 : 1.2}
                strokeDasharray={creado ? undefined : "4 3"}
              />
              {e.clase === "CASA" && <path d={`M ${e.x + 4} ${e.y + 11} L ${e.x + e.w / 2} ${e.y + 3} L ${e.x + e.w - 4} ${e.y + 11}`} fill="none" stroke={col.borde} strokeWidth={1.2} />}
              {e.clase === "TORRE" && (
                <>
                  {Array.from({ length: 4 }, (_, i) => (
                    <line key={i} x1={e.x + 12} x2={e.x + e.w - 12} y1={e.y + 56 + i * 14} y2={e.y + 56 + i * 14} stroke="#b9d3ce" strokeWidth={1} />
                  ))}
                </>
              )}
              <text
                x={e.x + e.w / 2}
                y={e.clase === "TORRE" ? e.y + 28 : e.clase === "INSTALACION" ? e.y + 26 : e.y + e.h / 2 + (e.clase === "CASA" ? 6 : 3)}
                textAnchor="middle"
                fontSize={e.clase === "TORRE" ? 16 : e.clase === "ESTACIONAMIENTO" || e.clase === "BODEGA" ? 7 : fuente(e)}
                fontWeight={700}
                fill={col.texto}
                transform={e.clase === "ESTACIONAMIENTO" ? `rotate(-90 ${e.x + e.w / 2} ${e.y + e.h / 2 + 3})` : undefined}
              >
                {e.clase === "TORRE" && !e.etiqueta.toLowerCase().startsWith("torre") && !e.etiqueta.toLowerCase().startsWith("edificio") ? `Torre ${e.etiqueta}` : e.etiqueta}
              </text>
              {e.detalle && (e.clase === "TORRE" || e.clase === "INSTALACION") && (
                <text x={e.x + e.w / 2} y={e.clase === "TORRE" ? e.y + 46 : e.y + 44} textAnchor="middle" fontSize={10} fill="#52605e">
                  {e.detalle}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <BotonPlano titulo="Acercar" onClick={() => zoom(0.8)}>
          <Plus className="size-4" />
        </BotonPlano>
        <BotonPlano titulo="Alejar" onClick={() => zoom(1.25)}>
          <Minus className="size-4" />
        </BotonPlano>
        <BotonPlano titulo="Ver todo" onClick={ajustar}>
          <Maximize2 className="size-4" />
        </BotonPlano>
      </div>
      {puedeMover && (
        <button
          type="button"
          onClick={() => setModoMover((m) => !m)}
          aria-pressed={modoMover}
          className={`absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-sm ${
            modoMover ? "border-naranja bg-naranja text-white" : "border-borde bg-white text-convive-oscuro"
          }`}
        >
          <Move className="size-4" />
          {modoMover ? "Moviendo: arrastra un elemento" : "Mover elementos"}
        </button>
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] text-texto-suave">
        <span>
          <span className="mr-1 inline-block h-2.5 w-4 rounded-sm border border-marca bg-marca-suave align-middle" />
          Creado en Convive
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-4 rounded-sm border border-dashed border-marca align-middle" />
          Propuesto
        </span>
      </div>
    </div>
  );
}

function BotonPlano({ titulo, onClick, children }: { titulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-xl border border-borde bg-white text-convive-oscuro shadow-sm hover:bg-convive-suave"
    >
      {children}
    </button>
  );
}
