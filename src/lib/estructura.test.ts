import { test } from "node:test";
import assert from "node:assert/strict";
import { arbolAgrupaciones, propiedadDe, revisarAsignacion, revisarEspacio, rutaAgrupacion, type AgrupacionPlana } from "./estructura";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("ruta y árbol de agrupaciones: torre con pisos, y un sector suelto", () => {
  const a: AgrupacionPlana[] = [
    { id: "p2", tipo: "PISO", nombre: "2", padreId: "t", orden: 2 },
    { id: "t", tipo: "TORRE", nombre: "A", padreId: null, orden: 0 },
    { id: "p1", tipo: "PISO", nombre: "1", padreId: "t", orden: 1 },
    { id: "s", tipo: "SECTOR", nombre: "Sector Norte", padreId: null, orden: 1 },
  ];
  assert.equal(rutaAgrupacion("p2", a), "Torre A › Piso 2");
  assert.equal(rutaAgrupacion("s", a), "Sector Norte");
  assert.equal(rutaAgrupacion("n", [...a, { id: "n", tipo: "NIVEL", nombre: "Subterráneo -1", padreId: null, orden: 3 }]), "Subterráneo -1");
  assert.equal(rutaAgrupacion("n", [{ id: "n", tipo: "NIVEL", nombre: "-2", padreId: null, orden: 0 }]), "Nivel -2");
  assert.deepEqual(
    arbolAgrupaciones(a).map((x) => [x.id, x.nivel]),
    [["t", 0], ["p1", 1], ["p2", 1], ["s", 0]],
  );
});

test("un estacionamiento de visitas como bien común no se vincula a ninguna unidad", () => {
  const ok = revisarEspacio({ regimen: "BIEN_COMUN", destino: "VISITAS", unidadPropiaId: null, unidadPrincipalId: null });
  assert.deepEqual(ok.errores, {});
  assert.deepEqual(ok.advertencias, []);
  const mal = revisarEspacio({ regimen: "BIEN_COMUN", destino: "VISITAS", unidadPropiaId: null, unidadPrincipalId: "u1" });
  assert.ok(mal.errores.unidadPrincipalId);
  assert.equal(propiedadDe({ regimen: "BIEN_COMUN" }), "La comunidad (bien común)");
});

test("un accesorio exige su unidad principal; por definir no presume nada", () => {
  assert.ok(revisarEspacio({ regimen: "ACCESORIO", destino: "PRIVADO", unidadPropiaId: null, unidadPrincipalId: null }).errores.unidadPrincipalId);
  const pd = revisarEspacio({ regimen: "POR_DEFINIR", destino: null, unidadPropiaId: null, unidadPrincipalId: null });
  assert.deepEqual(pd.errores, {});
  assert.equal(pd.advertencias.length, 2);
  assert.equal(propiedadDe({ regimen: "ACCESORIO", unidadPrincipal: { numero: "305" } }), "Propietarios de la unidad 305");
});

test("las asignaciones de uso de un espacio no se cruzan", () => {
  const vigente = { desde: d("2026-01-01"), hasta: null, beneficiario: "Unidad 101" };
  assert.match(revisarAsignacion({ desde: d("2026-06-01"), hasta: null }, [vigente])!, /sigue vigente/);
  const terminada = { desde: d("2026-01-01"), hasta: d("2026-05-31"), beneficiario: "Unidad 101" };
  assert.equal(revisarAsignacion({ desde: d("2026-06-01"), hasta: d("2026-06-30") }, [terminada]), null);
  assert.match(revisarAsignacion({ desde: d("2026-05-31"), hasta: null }, [terminada])!, /Se cruza/);
  assert.match(revisarAsignacion({ desde: d("2026-06-10"), hasta: d("2026-06-01") }, [])!, /anterior/);
});

test("hoyDia usa la fecha de Chile: a las 23:30 del 31 dic en Santiago sigue siendo 31", async () => {
  const { hoyDia, asignacionVigente } = await import("./estructura");
  // 2026-12-31 23:30 en Santiago (verano, UTC-3) = 2027-01-01 02:30 UTC.
  assert.equal(hoyDia(new Date("2027-01-01T02:30:00Z")).toISOString().slice(0, 10), "2026-12-31");
  const asig = [{ desde: d("2026-01-01"), hasta: d("2026-12-31") }];
  assert.ok(asignacionVigente(asig, hoyDia(new Date("2027-01-01T02:30:00Z"))));
  assert.equal(asignacionVigente(asig, d("2027-01-01")), null);
});

test("situación: un accesorio sin asignación lo usa su dueño; uno común queda disponible", async () => {
  const { situacionEspacio } = await import("./estructura");
  assert.equal(situacionEspacio({ estado: "DISPONIBLE", regimen: "ACCESORIO", unidadPrincipal: { numero: "101" } }, null).quien, "Unidad 101 (propietaria)");
  assert.equal(situacionEspacio({ estado: "DISPONIBLE", regimen: "BIEN_COMUN" }, null).texto, "Disponible");
  assert.equal(situacionEspacio({ estado: "ASIGNADO", regimen: "BIEN_COMUN" }, { beneficiario: "Unidad 201" }).texto, "Con uso asignado");
  assert.equal(situacionEspacio({ estado: "FUERA_DE_USO", regimen: "BIEN_COMUN" }, null).tono, "alerta");
});
