import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { MARCA } from "@/lib/marca";
import "./globals.css";

const fuente = Figtree({
  variable: "--font-marca",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: MARCA.nombre,
  description: MARCA.descripcion,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${fuente.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
