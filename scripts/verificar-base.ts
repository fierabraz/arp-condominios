// Protege la base real: se ejecuta antes de las migraciones en cada publicación de Vercel.
// - En producción anota en la base qué servidor de Neon (endpoint) es el de producción.
// - En versiones de prueba (preview) detiene la publicación si la conexión apunta a ese mismo
//   servidor, para que una prueba nunca migre ni modifique los datos reales.
// Neon crea para cada versión de prueba una copia (rama) con otro servidor, así que la anotación
// copiada no coincide con la conexión de la prueba y la publicación sigue normal.
// Fuera de Vercel (en tu computador o en GitHub) no hace nada.
import "dotenv/config";
import { Client } from "pg";

const entorno = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

/** Identifica el servidor de Neon sin exponer la clave: "ep-xxx-pooler.region..." → "ep-xxx.region...". */
function servidor(conexion: string) {
  return new URL(conexion).hostname.replace("-pooler.", ".");
}

async function main() {
  if (!entorno || entorno === "development") return;
  if (!url) {
    console.error("No hay DATABASE_URL para esta publicación. Revisa la conexión de la base en Vercel → Storage.");
    process.exit(1);
  }
  const actual = servidor(url);
  console.log(`Entorno: ${entorno}. Base de datos: ${actual}`);

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    // Va en un esquema aparte para que Prisma no lo confunda con sus tablas.
    await db.query(`CREATE SCHEMA IF NOT EXISTS publicacion`);
    await db.query(
      `CREATE TABLE IF NOT EXISTS publicacion.entorno (
         id INT PRIMARY KEY,
         servidor_produccion TEXT NOT NULL,
         actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    if (entorno === "production") {
      await db.query(
        `INSERT INTO publicacion.entorno (id, servidor_produccion) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET servidor_produccion = EXCLUDED.servidor_produccion, actualizado_en = now()`,
        [actual],
      );
      console.log("Base de producción anotada.");
      return;
    }

    const { rows } = await db.query(`SELECT servidor_produccion FROM publicacion.entorno WHERE id = 1`);
    const produccion: string | undefined = rows[0]?.servidor_produccion;
    if (!produccion) {
      console.warn("Aviso: aún no se sabe cuál es la base de producción (se anota en la próxima publicación de producción).");
      return;
    }
    if (produccion === actual) {
      console.error(
        "ALTO: esta versión de prueba está conectada a la base de datos REAL. No se aplicó ningún cambio.\n" +
          "Activa en Vercel → Storage → (tu base) la opción que crea una base para cada versión de prueba (Preview).",
      );
      process.exit(1);
    }
    console.log("Correcto: esta versión de prueba usa una base separada de la real.");
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
