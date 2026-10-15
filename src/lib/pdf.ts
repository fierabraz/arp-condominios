import "server-only";
import PDFDocument from "pdfkit";

export type Pdf = PDFKit.PDFDocument;

export const COLOR = { texto: "#1a1d23", suave: "#5b6270", linea: "#d9dce1", acento: "#1d4ed8", fondo: "#f3f4f6" };
export const MARGEN = 50;
export const ANCHO = 595.28 - MARGEN * 2; // A4

/** Crea un PDF A4, deja que `dibujar` lo llene y devuelve el archivo. */
export function generarPdf(titulo: string, dibujar: (doc: Pdf) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGEN, info: { Title: titulo } });
    const partes: Buffer[] = [];
    doc.on("data", (p: Buffer) => partes.push(p));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
    doc.font("Helvetica").fillColor(COLOR.texto);
    dibujar(doc);
    doc.end();
  });
}

export type Columna = { titulo: string; ancho: number; alinear?: "left" | "right" };

/** Tabla simple: encabezado gris y filas con línea divisoria. Las filas en negrita se marcan con `fuerte`. */
export function tabla(doc: Pdf, columnas: Columna[], filas: { celdas: string[]; fuerte?: boolean }[]) {
  const x0 = MARGEN;
  const alto = 20;
  const dibujarFila = (celdas: string[], y: number, fuente: string, color: string) => {
    let x = x0;
    doc.font(fuente).fontSize(9.5).fillColor(color);
    columnas.forEach((c, i) => {
      doc.text(celdas[i] ?? "", x + 6, y + 6, { width: c.ancho - 12, align: c.alinear ?? "left", lineBreak: false });
      x += c.ancho;
    });
  };
  const encabezado = () => {
    const y = doc.y;
    doc.rect(x0, y, ANCHO, alto).fill(COLOR.fondo);
    dibujarFila(columnas.map((c) => c.titulo), y, "Helvetica-Bold", COLOR.suave);
    doc.y = y + alto;
  };
  encabezado();
  for (const fila of filas) {
    if (doc.y + alto > doc.page.height - MARGEN) {
      doc.addPage();
      encabezado();
    }
    const y = doc.y;
    dibujarFila(fila.celdas, y, fila.fuerte ? "Helvetica-Bold" : "Helvetica", COLOR.texto);
    doc.moveTo(x0, y + alto).lineTo(x0 + ANCHO, y + alto).lineWidth(0.5).strokeColor(COLOR.linea).stroke();
    doc.y = y + alto;
  }
  doc.x = x0;
  doc.moveDown(1);
}

export function encabezado(doc: Pdf, { arriba, titulo, abajo }: { arriba: string; titulo: string; abajo: string }) {
  doc.font("Helvetica").fontSize(9).fillColor(COLOR.suave).text(arriba);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLOR.texto).text(titulo);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(COLOR.suave).text(abajo);
  doc.moveDown(1);
}

export function subtitulo(doc: Pdf, texto: string) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR.texto).text(texto, MARGEN);
  doc.moveDown(0.4);
}

/** Fila de cifras destacadas, como tarjetas. */
export function cifras(doc: Pdf, items: { etiqueta: string; valor: string }[]) {
  const y = doc.y;
  const gap = 10;
  const w = (ANCHO - gap * (items.length - 1)) / items.length;
  items.forEach((it, i) => {
    const x = MARGEN + i * (w + gap);
    doc.roundedRect(x, y, w, 52, 6).lineWidth(0.75).strokeColor(COLOR.linea).stroke();
    doc.font("Helvetica").fontSize(8.5).fillColor(COLOR.suave).text(it.etiqueta, x + 10, y + 10, { width: w - 20 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(COLOR.texto).text(it.valor, x + 10, y + 26, { width: w - 20 });
  });
  doc.x = MARGEN;
  doc.y = y + 52 + 16;
}

export function respuestaPdf(archivo: Buffer, nombre: string) {
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
