import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { coincideUnidad, estadoCodigo, normalizarCodigo, textoPerfil, vinculosDeRelacion } from "./cuentas-reglas";

const ahora = new Date("2026-11-18T12:00:00Z");
const base = { correo: null, usos: 0, usosMaximos: 1, expiraEn: new Date("2026-11-25T12:00:00Z"), anuladoEn: null };

describe("códigos de acceso para administradores (PILOTO-001)", () => {
  test("vigente, vencido, agotado y anulado", () => {
    assert.equal(estadoCodigo(base, "a@b.cl", ahora), "VALIDO");
    assert.equal(estadoCodigo({ ...base, expiraEn: ahora }, "a@b.cl", ahora), "VENCIDO");
    assert.equal(estadoCodigo({ ...base, usos: 1 }, "a@b.cl", ahora), "AGOTADO");
    assert.equal(estadoCodigo({ ...base, anuladoEn: ahora }, "a@b.cl", ahora), "ANULADO");
  });
  test("un código para un correo no sirve para otro", () => {
    const c = { ...base, correo: "leyla@ejemplo.cl" };
    assert.equal(estadoCodigo(c, "LEYLA@ejemplo.cl", ahora), "VALIDO");
    assert.equal(estadoCodigo(c, "otra@ejemplo.cl", ahora), "OTRO_CORREO");
  });
  test("el código se acepta escrito sin guiones o en minúsculas", () => {
    assert.equal(normalizarCodigo("cv abcd efgh jkmn"), "CV-ABCD-EFGH-JKMN");
    assert.equal(normalizarCodigo("abcd-efgh"), "ABCD-EFGH");
    assert.equal(normalizarCodigo("abcdefgh"), "ABCD-EFGH");
  });
});

describe("relación declarada → vínculos de COM-001", () => {
  test("propietario residente queda con dos vínculos; el no residente solo propietario", () => {
    assert.deepEqual(vinculosDeRelacion("PROPIETARIO_RESIDENTE"), ["PROPIETARIO", "RESIDENTE"]);
    assert.deepEqual(vinculosDeRelacion("PROPIETARIO_NO_RESIDENTE"), ["PROPIETARIO"]);
    assert.deepEqual(vinculosDeRelacion("ARRENDATARIO"), ["ARRENDATARIO"]);
    assert.deepEqual(vinculosDeRelacion("OCUPANTE_AUTORIZADO"), ["RESIDENTE"]);
  });
});

describe("unidad escrita por la persona", () => {
  test("encuentra el número aunque escriba depto o casa", () => {
    assert.ok(coincideUnidad("Depto 302", "302"));
    assert.ok(coincideUnidad("302", "302"));
    assert.ok(coincideUnidad("casa 12-B", "12B"));
    assert.ok(!coincideUnidad("1302", "302"));
    assert.ok(!coincideUnidad("", "302"));
  });
});

describe("nombre del perfil", () => {
  test("cargos del equipo", () => {
    assert.equal(textoPerfil({ rol: "ADMINISTRADOR", accesoTodas: true, cargo: null }), "Administrador/a principal");
    assert.equal(textoPerfil({ rol: "ADMINISTRADOR", accesoTodas: false, cargo: "CONSERJE" }), "Conserje");
  });
});
