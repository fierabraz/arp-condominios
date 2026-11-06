import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ajustar,
  alicuotaProvisional,
  cambiarSectores,
  comparar,
  distribuir,
  normalizar,
  planificar,
  respuestasIniciales,
  type Respuestas,
} from "./generador";

function edificios(cambios: (r: Respuestas) => void = () => {}) {
  const r = respuestasIniciales("EDIFICIOS");
  r.edificios.cantidad = 3;
  r.edificios.modelo = { pisos: 6, deptosPorPiso: 4, subterraneos: 0 };
  r.edificios.numeracion.prefijoTorre = true;
  cambios(r);
  return ajustar(r);
}

describe("generador visual (COM-001-VIS)", () => {
  test("3 torres × 6 pisos × 4 deptos con prefijo de torre: A-101 a C-604", () => {
    const plan = planificar(edificios());
    assert.equal(plan.unidades.length, 72);
    assert.equal(plan.unidades[0].numero, "A-101");
    assert.equal(plan.unidades[23].numero, "A-604");
    assert.equal(plan.unidades[71].numero, "C-604");
    assert.equal(plan.agrupaciones.filter((a) => a.tipo === "TORRE").length, 3);
    assert.equal(plan.agrupaciones.filter((a) => a.tipo === "PISO").length, 18);
  });

  test("sin prefijo de torre los números se repiten y no se puede crear", () => {
    const plan = planificar(edificios((r) => (r.edificios.numeracion.prefijoTorre = false)));
    const c = comparar(plan, { agrupaciones: [], unidades: [], espacios: [], instalaciones: [] }, {});
    assert.ok(c.errores.some((e) => e.includes("repetidos")));
  });

  test("correlativo con ceros, inicio y números omitidos", () => {
    const r = respuestasIniciales("EDIFICIOS");
    r.edificios.modelo = { pisos: 2, deptosPorPiso: 3, subterraneos: 0 };
    r.edificios.numeracion = { ...r.edificios.numeracion, esquema: "CORRELATIVO", digitos: 3, inicio: 1, omitir: "004" };
    const plan = planificar(ajustar(r));
    assert.deepEqual(
      plan.unidades.map((u) => u.numero),
      ["001", "002", "003", "005", "006", "007"],
    );
  });

  test("excepciones: una torre distinta y un piso con menos departamentos", () => {
    const r = edificios((r) => (r.edificios.iguales = false));
    r.edificios.torres[2] = { ...r.edificios.torres[2], pisos: 5, excepciones: [{ piso: 1, unidades: 2 }] };
    const plan = planificar(ajustar(r));
    assert.equal(plan.unidades.filter((u) => u.grupo === "T3").length, 18);
    assert.equal(plan.unidades.find((u) => u.grupo === "T3")?.numero, "C-101");
  });

  test("casas: 40 en 2 sectores, numeración por sector A-01 … B-20", () => {
    const r = respuestasIniciales("CASAS");
    r.casas.cantidad = 40;
    r.casas.conSectores = true;
    r.casas = cambiarSectores(r.casas, 2);
    r.casas.numeracion.esquema = "POR_SECTOR";
    const plan = planificar(ajustar(r));
    assert.equal(plan.unidades.length, 40);
    assert.equal(plan.unidades[0].numero, "A-01");
    assert.equal(plan.unidades[39].numero, "B-20");
    assert.equal(plan.agrupaciones.length, 2);
  });

  test("volver a generar no duplica: lo ya creado se reconoce por su id aunque cambie el número", () => {
    const r = edificios();
    const plan = planificar(r);
    const ex = {
      agrupaciones: [],
      unidades: plan.unidades.map((u, i) => ({ id: `u${i}`, numero: u.numero, agrupacionId: null })),
      espacios: [],
      instalaciones: [],
    };
    const registros = Object.fromEntries(plan.unidades.map((u, i) => [u.clave, `u${i}`]));
    const c1 = comparar(plan, ex, registros);
    assert.equal(c1.crear.unidades.length, 0);
    assert.equal(c1.reutilizar.unidades, 72);

    // Se cambia la numeración: las mismas 72 unidades cambian de número, no se crean otras.
    r.edificios.numeracion.separador = "";
    const c2 = comparar(planificar(r), ex, registros);
    assert.equal(c2.crear.unidades.length, 0);
    assert.equal(c2.renumerar.length, 72);
    assert.equal(c2.renumerar[0].a, "A101");
  });

  test("unidades cargadas por Excel se reutilizan por su número; las que sobran se conservan", () => {
    const plan = planificar(edificios());
    const ex = {
      agrupaciones: [],
      unidades: [
        { id: "x1", numero: "A-101", agrupacionId: null },
        { id: "x2", numero: "Local 1", agrupacionId: null },
      ],
      espacios: [],
      instalaciones: [],
    };
    const c = comparar(plan, ex, {});
    assert.equal(c.reutilizar.unidades, 1);
    assert.equal(c.crear.unidades.length, 71);
    assert.deepEqual(c.fuera.unidades.map((u) => u.numero), ["Local 1"]);
    assert.equal(c.ubicar.length, 1);
  });

  test("reducir una torre no borra: las unidades sobrantes quedan fuera del plan", () => {
    const r = edificios();
    const plan = planificar(r);
    const ex = { agrupaciones: [], unidades: plan.unidades.map((u, i) => ({ id: `u${i}`, numero: u.numero, agrupacionId: null })), espacios: [], instalaciones: [] };
    const registros = Object.fromEntries(plan.unidades.map((u, i) => [u.clave, `u${i}`]));
    r.edificios.iguales = false;
    r.edificios.torres[2].pisos = 5;
    const c = comparar(planificar(ajustar(r)), ex, registros);
    assert.equal(c.fuera.unidades.length, 4);
    assert.equal(c.crear.unidades.length, 0);
  });

  test("estacionamientos 'todos' proponen uno por unidad, por confirmar", () => {
    const r = edificios();
    r.estacionamientos.modo = "TODOS";
    r.extras.visitas = 3;
    const plan = planificar(r);
    const est = plan.espacios.filter((e) => e.clase === "ESTACIONAMIENTO");
    assert.equal(est.length, 75);
    assert.equal(est[0].codigo, "E-001");
    assert.match(est[0].nota ?? "", /por confirmar/);
    assert.equal(est.filter((e) => e.destino === "VISITAS").length, 3);
  });

  test("normalizar limita valores y descarta claves desconocidas", () => {
    const r = normalizar({ tipo: "EDIFICIOS", edificios: { cantidad: 999, modelo: { pisos: -3 } }, instalaciones: { PISCINA: { cantidad: 1 }, NAVE: { cantidad: 3 } } });
    assert.equal(r.edificios.cantidad, 30);
    assert.equal(r.edificios.modelo.pisos, 1);
    assert.deepEqual(Object.keys(r.instalaciones), ["PISCINA"]);
    assert.equal(normalizar("basura").tipo, null);
  });

  test("distribuir usa las posiciones guardadas y la alícuota provisional no pasa de 100", () => {
    const plan = planificar(edificios());
    const d = distribuir(plan, { T1: { x: 500, y: 400 } });
    const t1 = d.elementos.find((e) => e.clave === "T1");
    assert.deepEqual([t1?.x, t1?.y], [500, 400]);
    assert.ok(alicuotaProvisional(60) * 60 <= 100);
  });
});
