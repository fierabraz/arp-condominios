import QRCode from "qrcode";
import { COLOR, type Pdf } from "@/lib/pdf";

// PAG-001 · Código QR dibujado como vector dentro del PDF (se ve nítido al imprimir y no
// necesita imágenes). Solo contiene el enlace de pago del aviso: ningún dato personal.

export function dibujarQr(doc: Pdf, texto: string, x: number, y: number, lado: number) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const borde = 4; // zona blanca alrededor que exigen los lectores
  const celda = lado / (n + borde * 2);
  doc.save();
  doc.rect(x, y, lado, lado).fill("#ffffff");
  doc.fillColor("#000000");
  for (let fila = 0; fila < n; fila++) {
    for (let col = 0; col < n; col++) {
      if (qr.modules.get(fila, col)) {
        doc.rect(x + (col + borde) * celda, y + (fila + borde) * celda, celda + 0.05, celda + 0.05);
      }
    }
  }
  doc.fill("#000000");
  doc.restore();
  doc.fillColor(COLOR.texto);
}
