import assert from "node:assert/strict";
import { test } from "node:test";
import { enviarPorApi, leerDireccion, peticionBrevo, peticionResend, proveedorActivo, type Mensaje } from "./correo-proveedores";

const mensaje: Mensaje = {
  de: { nombre: "Convive", correo: "avisos@convive.cl" },
  para: "ana@correo.cl",
  responderA: { nombre: "Administración", correo: "admin@convive.cl" },
  asunto: "Aviso",
  texto: "Hola",
  html: "<p>Hola</p>",
  adjuntos: [{ nombre: "aviso.pdf", contenido: Buffer.from("PDF") }],
};

test("elige el servicio según las variables", () => {
  assert.equal(proveedorActivo({}), "PRUEBA");
  assert.equal(proveedorActivo({ SMTP_HOST: "smtp.x" }), "SMTP");
  assert.equal(proveedorActivo({ RESEND_API_KEY: "re_1", SMTP_HOST: "smtp.x" }), "RESEND");
  assert.equal(proveedorActivo({ BREVO_API_KEY: "xkey", RESEND_API_KEY: "re_1" }), "BREVO");
  assert.equal(proveedorActivo({ BREVO_API_KEY: "  " }), "PRUEBA");
});

test("lee el remitente con o sin nombre", () => {
  assert.deepEqual(leerDireccion("Convive <avisos@convive.cl>"), { nombre: "Convive", correo: "avisos@convive.cl" });
  assert.deepEqual(leerDireccion('"Edificio Sol" <a@b.cl>'), { nombre: "Edificio Sol", correo: "a@b.cl" });
  assert.deepEqual(leerDireccion("a@b.cl", "Convive"), { nombre: "Convive", correo: "a@b.cl" });
  assert.equal(leerDireccion(""), null);
  assert.equal(leerDireccion("no es un correo"), null);
});

test("arma la petición de Brevo con adjunto en base64", () => {
  const p = peticionBrevo(mensaje, "xkey");
  assert.equal(p.headers["api-key"], "xkey");
  const b = JSON.parse(p.body);
  assert.deepEqual(b.sender, { name: "Convive", email: "avisos@convive.cl" });
  assert.deepEqual(b.to, [{ email: "ana@correo.cl" }]);
  assert.equal(b.replyTo.email, "admin@convive.cl");
  assert.deepEqual(b.attachment, [{ name: "aviso.pdf", content: Buffer.from("PDF").toString("base64") }]);
});

test("arma la petición de Resend", () => {
  const p = peticionResend({ ...mensaje, adjuntos: undefined, responderA: null }, "re_1");
  assert.equal(p.headers.authorization, "Bearer re_1");
  const b = JSON.parse(p.body);
  assert.equal(b.from, "Convive <avisos@convive.cl>");
  assert.deepEqual(b.to, ["ana@correo.cl"]);
  assert.equal(b.attachments, undefined);
  assert.equal(b.reply_to, undefined);
});

test("reintenta cuando el servicio pide esperar y explica los rechazos", async () => {
  let llamadas = 0;
  const lento = (async () => {
    llamadas++;
    return llamadas < 3 ? new Response("{}", { status: 429 }) : new Response("{}", { status: 201 });
  }) as typeof fetch;
  assert.deepEqual(await enviarPorApi("BREVO", mensaje, "k", { fetch: lento, esperaMs: 1 }), { ok: true });
  assert.equal(llamadas, 3);

  const rechazo = (async () =>
    new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 })) as typeof fetch;
  const r = await enviarPorApi("BREVO", mensaje, "k", { fetch: rechazo });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /BREVO_API_KEY/);
});
