// Identidad de la plataforma en un solo lugar. Para cambiar de marca se edita este
// archivo, los colores de src/app/globals.css (bloque "Marca") y las imágenes de public/marca/.
export const MARCA = {
  nombre: "Convive",
  descripcion: "Administración de edificios y condominios",
  remitente: "Convive <no-responder@localhost>",
  // Logo original (CorelDRAW) entregado por Oscar el 2026-11-05, convertido a SVG vectorial:
  // se ve nítido en cualquier tamaño. El PDF de origen está en docs/marca/.
  // El favicon (src/app/icon.svg) es una copia del símbolo; apple-icon.png se genera desde él.
  simbolo: { src: "/marca/convive-simbolo.svg", ancho: 577, alto: 577 },
  nombreImagen: { src: "/marca/convive-nombre.svg", ancho: 956, alto: 211 },
  logoCompleto: { src: "/marca/convive-logo.svg", ancho: 992, alto: 849 },
};
