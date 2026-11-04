import { test } from "node:test";
import assert from "node:assert/strict";
import { enlaceWhatsapp, estadoAcceso, numeroWhatsapp, puedeInvitar } from "./invitacion-estado";

const ahora = new Date("2026-11-04T12:00:00Z");
const manana = new Date("2026-11-05T12:00:00Z");
const ayer = new Date("2026-11-03T12:00:00Z");
const cuenta = (c: Partial<Parameters<typeof estadoAcceso>[1] & object> = {}) => ({
  activo: true,
  claveActualizadaEn: null,
  ultimoIngresoEn: null,
  invitaciones: [],
  ...c,
});

test("estadoAcceso según correo, cuenta e invitaciones", () => {
  assert.equal(estadoAcceso(null, null, ahora), "SIN_CORREO");
  assert.equal(estadoAcceso("a@b.cl", null, ahora), "SIN_CUENTA");
  assert.equal(estadoAcceso("a@b.cl", cuenta({ invitaciones: [{ expiraEn: manana, usadoEn: null }] }), ahora), "INVITADA");
  assert.equal(estadoAcceso("a@b.cl", cuenta({ invitaciones: [{ expiraEn: ayer, usadoEn: null }] }), ahora), "VENCIDA");
  assert.equal(
    estadoAcceso("a@b.cl", cuenta({ claveActualizadaEn: ayer, invitaciones: [{ expiraEn: manana, usadoEn: ayer }] }), ahora),
    "ACTIVA",
  );
  // Cuenta creada a mano con contraseña, sin invitación.
  assert.equal(estadoAcceso("a@b.cl", cuenta(), ahora), "ACTIVA");
  assert.equal(estadoAcceso("a@b.cl", cuenta({ activo: false }), ahora), "DESACTIVADA");
  assert.equal(puedeInvitar("ACTIVA"), false);
  assert.equal(puedeInvitar("VENCIDA"), true);
});

test("numeroWhatsapp agrega el código de Chile a celulares de 9 dígitos", () => {
  assert.equal(numeroWhatsapp("9 1234 5678"), "56912345678");
  assert.equal(numeroWhatsapp("+56 9 1234 5678"), "56912345678");
  assert.equal(numeroWhatsapp("1234 5678"), "56912345678");
  assert.equal(numeroWhatsapp("123"), undefined);
  assert.equal(numeroWhatsapp(null), undefined);
});

test("enlaceWhatsapp sin número deja elegir el contacto", () => {
  assert.equal(enlaceWhatsapp(null, "hola mundo"), "https://wa.me/?text=hola%20mundo");
  assert.equal(enlaceWhatsapp("912345678", "x"), "https://wa.me/56912345678?text=x");
});
