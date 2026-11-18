// Ayuda para limpiar datos de prueba. Las constancias de pago son inmutables (la base impide
// modificarlas o borrarlas); solo aquí, dentro de una transacción de prueba, se habilita el borrado.
import { db } from "../src/lib/db";

export async function borrarConstancias(administradoraId: string) {
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL convive.borrar_constancias = 'si'`);
    await tx.constanciaVersion.deleteMany({ where: { constancia: { administradoraId } } });
    await tx.constanciaPago.deleteMany({ where: { administradoraId } });
  });
}
