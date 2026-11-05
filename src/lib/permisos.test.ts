import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alcanzaCondominio,
  condominiosPermitidos,
  esPrincipal,
  filtroCondominios,
  filtroPersonas,
  filtroPorCondominio,
  filtroRegistro,
  type Alcance,
} from "./permisos";

const principal: Alcance = { rol: "ADMINISTRADOR", accesoTodas: true, condominioId: null, asignados: [] };
const asignado: Alcance = { rol: "ADMINISTRADOR", accesoTodas: false, condominioId: null, asignados: ["A"] };
const sinAsignar: Alcance = { rol: "ADMINISTRADOR", accesoTodas: false, condominioId: null, asignados: [] };
const comite: Alcance = { rol: "COMITE", accesoTodas: false, condominioId: "B", asignados: [] };
const residente: Alcance = { rol: "RESIDENTE", accesoTodas: true, condominioId: null, asignados: ["A"] };
const plataforma: Alcance = { rol: "SUPERADMIN", accesoTodas: true, condominioId: null, asignados: [] };

test("el administrador principal ve todas las propiedades, también las nuevas", () => {
  assert.equal(condominiosPermitidos(principal), null);
  assert.equal(alcanzaCondominio(principal, "cualquiera"), true);
  assert.deepEqual(filtroCondominios(principal), {});
  assert.deepEqual(filtroPorCondominio(principal), {});
  assert.deepEqual(filtroPersonas(principal), {});
  assert.deepEqual(filtroRegistro(principal), {});
  assert.equal(esPrincipal(principal), true);
});

test("un administrador no principal ve solo sus propiedades asignadas", () => {
  assert.deepEqual(condominiosPermitidos(asignado), ["A"]);
  assert.equal(alcanzaCondominio(asignado, "A"), true);
  assert.equal(alcanzaCondominio(asignado, "B"), false);
  assert.deepEqual(filtroCondominios(asignado), { id: { in: ["A"] } });
  assert.deepEqual(filtroPorCondominio(asignado), { condominioId: { in: ["A"] } });
  assert.deepEqual(filtroRegistro(asignado), { condominioId: { in: ["A"] } });
  assert.equal(esPrincipal(asignado), false);
});

test("un administrador sin asignaciones no ve ninguna propiedad", () => {
  assert.deepEqual(condominiosPermitidos(sinAsignar), []);
  assert.equal(alcanzaCondominio(sinAsignar, "A"), false);
  assert.deepEqual(filtroCondominios(sinAsignar), { id: { in: [] } });
});

test("las personas de otras propiedades quedan fuera; las sin unidad se ven", () => {
  assert.deepEqual(filtroPersonas(asignado), {
    OR: [{ unidades: { none: {} } }, { unidades: { some: { unidad: { condominioId: { in: ["A"] } } } } }],
  });
});

test("el comité ve solo su propiedad", () => {
  assert.deepEqual(condominiosPermitidos(comite), ["B"]);
  assert.equal(alcanzaCondominio(comite, "B"), true);
  assert.equal(alcanzaCondominio(comite, "A"), false);
  assert.equal(esPrincipal(comite), false);
});

test("residentes y plataforma no entran a propiedades desde la administración", () => {
  // Aunque tuvieran datos de acceso guardados por error, su rol no da alcance.
  assert.equal(alcanzaCondominio(residente, "A"), false);
  assert.equal(alcanzaCondominio(plataforma, "A"), false);
  assert.equal(esPrincipal(residente), false);
  assert.equal(esPrincipal(plataforma), false);
});
