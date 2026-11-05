import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarDuplicado, relacionDe, relacionesVigentes, revisarVinculo, type VinculoExistente } from "./vinculos";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const hoy = d("2026-11-05");

test("cada vínculo da la relación de siempre; el ocupante no da acceso", () => {
  assert.equal(relacionDe("COPROPIETARIO"), "PROPIETARIO");
  assert.equal(relacionDe("ARRENDATARIO"), "RESIDENTE");
  assert.equal(relacionDe("OCUPANTE"), null);
  assert.deepEqual(
    relacionesVigentes([
      { tipo: "PROPIETARIO", hasta: null },
      { tipo: "RESIDENTE", hasta: d("2026-01-01") },
      { tipo: "OCUPANTE", hasta: null },
    ]),
    ["PROPIETARIO"],
  );
});

test("no se repite ni se contradice un vínculo vigente", () => {
  const ex: VinculoExistente[] = [
    { personaId: "ana", nombre: "Ana Ficticia", tipo: "PROPIETARIO", hasta: null },
    { personaId: "luis", nombre: "Luis Ficticio", tipo: "ARRENDATARIO", hasta: null },
    { personaId: "eva", nombre: "Eva Ficticia", tipo: "PROPIETARIO", hasta: d("2025-12-31") },
  ];
  const n = (personaId: string, tipo: VinculoExistente["tipo"], desde = "2026-11-01") => ({ personaId, tipo, desde: d(desde), terminoPrevisto: null });
  assert.match(revisarVinculo(n("ana", "PROPIETARIO"), ex, hoy)!, /Ya está registrado/);
  assert.match(revisarVinculo(n("ana", "COPROPIETARIO"), ex, hoy)!, /Ya es dueño/);
  assert.match(revisarVinculo(n("ana", "ARRENDATARIO"), ex, hoy)!, /no puede ser también/);
  assert.match(revisarVinculo(n("luis", "COPROPIETARIO"), ex, hoy)!, /termina el arriendo/);
  assert.match(revisarVinculo(n("pia", "PROPIETARIO"), ex, hoy)!, /Ana Ficticia ya figura/);
  assert.equal(revisarVinculo(n("pia", "COPROPIETARIO"), ex, hoy), null);
  assert.equal(revisarVinculo(n("ana", "RESIDENTE"), ex, hoy), null); // la dueña también vive ahí
  assert.equal(revisarVinculo(n("eva", "RESIDENTE"), ex, hoy), null); // su vínculo anterior terminó
  assert.match(revisarVinculo(n("pia", "RESIDENTE", "2026-12-01"), ex, hoy)!, /futura/);
  assert.match(revisarVinculo({ ...n("pia", "ARRENDATARIO"), terminoPrevisto: d("2026-01-01") }, ex, hoy)!, /anterior al inicio/);
});

test("duplicados: mismo RUT con otro formato o mismo correo es la misma persona; mismo nombre pide confirmar", () => {
  const personas = [
    { id: "1", nombre: "José Pérez Soto", documento: "12.345.678-K", correo: null },
    { id: "2", nombre: "María Ficticia", documento: null, correo: "maria@ejemplo.cl" },
  ];
  assert.equal(buscarDuplicado({ nombre: "Otro", documento: "12345678k" }, personas)?.tipo, "documento");
  assert.equal(buscarDuplicado({ nombre: "M", correo: "MARIA@ejemplo.cl" }, personas)?.tipo, "correo");
  assert.equal(buscarDuplicado({ nombre: "jose perez  soto" }, personas)?.tipo, "nombre");
  // Mismo nombre pero RUT distinto: son personas distintas.
  assert.equal(buscarDuplicado({ nombre: "José Pérez Soto", documento: "9.876.543-2" }, personas), null);
  // Al editar, no se compara consigo misma.
  assert.equal(buscarDuplicado({ nombre: "José Pérez Soto", documento: "12.345.678-K" }, personas, "1"), null);
});
