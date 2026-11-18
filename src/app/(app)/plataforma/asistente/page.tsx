import { requirePermiso } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, Insignia, PageHeader, Tabla, Vacio } from "@/components/ui";
import { finDelDiaChile, hoyChile } from "@/lib/formato";
import { configAsistente, costoEstimado } from "@/lib/asistente/reglas";

// IA-002 · Estado del asistente de ayuda y cuánto se usa. No muestra preguntas ni respuestas
// (no se guardan): solo cantidades y tokens, para controlar el costo.

const dolares = (n: number | null) =>
  n === null ? "—" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const miles = (n: number) => new Intl.NumberFormat("es-CL").format(n);

type Fila = { modelo: string; _count: { _all: number }; _sum: Record<string, number | null> };

function resumir(filas: Fila[]) {
  let consultas = 0;
  let costo: number | null = 0;
  let tokens = 0;
  for (const f of filas) {
    const uso = {
      entrada: f._sum.tokensEntrada ?? 0,
      salida: f._sum.tokensSalida ?? 0,
      cacheLectura: f._sum.tokensCacheLectura ?? 0,
      cacheEscritura: f._sum.tokensCacheEscritura ?? 0,
    };
    consultas += f._count._all;
    tokens += uso.entrada + uso.salida + uso.cacheLectura + uso.cacheEscritura;
    const c = costoEstimado(f.modelo, uso);
    costo = c === null || costo === null ? null : costo + c;
  }
  return { consultas, tokens, costo };
}

export default async function AsistentePlataformaPage() {
  await requirePermiso("plataforma");
  const config = configAsistente();
  const hoy = hoyChile();
  const inicioHoy = new Date(finDelDiaChile(hoy).getTime() - 24 * 60 * 60 * 1000 + 1000);
  const inicioMes = new Date(finDelDiaChile(`${hoy.slice(0, 8)}01`).getTime() - 24 * 60 * 60 * 1000 + 1000);
  const suma = { tokensEntrada: true, tokensSalida: true, tokensCacheLectura: true, tokensCacheEscritura: true } as const;
  const [deHoy, delMes, fallidasMes, porAdministradora, administradoras] = await Promise.all([
    db.consultaAsistente.groupBy({ by: ["modelo"], where: { creadoEn: { gte: inicioHoy } }, _count: { _all: true }, _sum: suma }),
    db.consultaAsistente.groupBy({ by: ["modelo"], where: { creadoEn: { gte: inicioMes } }, _count: { _all: true }, _sum: suma }),
    db.consultaAsistente.count({ where: { creadoEn: { gte: inicioMes }, exitosa: false } }),
    db.consultaAsistente.groupBy({ by: ["administradoraId", "modelo"], where: { creadoEn: { gte: inicioMes } }, _count: { _all: true }, _sum: suma }),
    db.administradora.findMany({ select: { id: true, nombre: true } }),
  ]);
  const hoyR = resumir(deHoy);
  const mesR = resumir(delMes);
  const nombres = new Map(administradoras.map((a) => [a.id, a.nombre]));
  const grupos = new Map<string, Fila[]>();
  for (const f of porAdministradora) {
    const clave = f.administradoraId ?? "";
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const filas = [...grupos.entries()]
    .map(([id, fs]) => ({ nombre: nombres.get(id) ?? "Sin administradora", ...resumir(fs) }))
    .sort((a, b) => b.consultas - a.consultas);

  return (
    <>
      <PageHeader
        titulo="Asistente IA"
        descripcion="Ayuda con inteligencia artificial para administradores, comité y residentes. Solo consulta: no hace pagos ni cambios."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-texto-suave">Estado</dt>
              <dd className="mt-1">
                <Insignia tono={config.activo ? "exito" : "alerta"}>{config.activo ? "Activo" : "Apagado"}</Insignia>
              </dd>
            </div>
            <div>
              <dt className="text-texto-suave">Modelo</dt>
              <dd className="mt-1 font-semibold">{config.modelo}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Límites por día</dt>
              <dd className="mt-1 font-semibold">
                {config.limitePersona} preguntas por persona · {config.limiteTotal} en toda la plataforma
              </dd>
            </div>
          </dl>
          {!config.activo && (
            <p className="mt-4 rounded-lg bg-alerta-suave px-3 py-2 text-sm text-alerta">
              Para activarlo, agrega ANTHROPIC_API_KEY en las variables de Vercel y vuelve a desplegar. Mientras
              tanto, el botón “Ayuda” no aparece.
            </p>
          )}
        </Card>
        <Card>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-texto-suave">Preguntas hoy</dt>
              <dd className="mt-1 text-2xl font-bold text-convive-oscuro">{miles(hoyR.consultas)}</dd>
              <dd className="text-texto-suave">≈ {dolares(hoyR.costo)}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Preguntas este mes</dt>
              <dd className="mt-1 text-2xl font-bold text-convive-oscuro">{miles(mesR.consultas)}</dd>
              <dd className="text-texto-suave">≈ {dolares(mesR.costo)}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Tokens este mes</dt>
              <dd className="mt-1 font-semibold">{miles(mesR.tokens)}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Sin respuesta este mes</dt>
              <dd className="mt-1 font-semibold">{miles(fallidasMes)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-texto-suave">
            Costo estimado en dólares con el precio de lista. El cobro real está en console.anthropic.com.
          </p>
        </Card>
      </div>
      <h2 className="mt-8 mb-3 text-xl font-bold text-convive-oscuro">Uso por administradora este mes</h2>
      {filas.length === 0 ? (
        <Vacio>Todavía nadie ha usado el asistente este mes.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th>Administradora</th>
              <th className="text-right">Preguntas</th>
              <th className="text-right">Costo estimado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td className="text-right">{miles(f.consultas)}</td>
                <td className="text-right">{dolares(f.costo)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </>
  );
}
