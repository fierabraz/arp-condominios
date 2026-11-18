-- CreateEnum
CREATE TYPE "TipoConciliacion" AS ENUM ('PAGO', 'OTRO_INGRESO');

-- AlterEnum
ALTER TYPE "EstadoTransferencia" ADD VALUE 'ANULADA';

-- AlterTable
ALTER TABLE "Condominio" ADD COLUMN     "demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConciliacionMovimiento" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "movimientoId" TEXT NOT NULL,
    "tipo" "TipoConciliacion" NOT NULL,
    "monto" DECIMAL(16,2) NOT NULL,
    "pagoId" TEXT,
    "transferenciaId" TEXT,
    "concepto" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPor" TEXT,
    "motivoAnulacion" TEXT,

    CONSTRAINT "ConciliacionMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConciliacionMovimiento_movimientoId_idx" ON "ConciliacionMovimiento"("movimientoId");

-- CreateIndex
CREATE INDEX "ConciliacionMovimiento_pagoId_idx" ON "ConciliacionMovimiento"("pagoId");

-- CreateIndex
CREATE INDEX "ConciliacionMovimiento_condominioId_creadoEn_idx" ON "ConciliacionMovimiento"("condominioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoBancario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaInformada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIN-COMP A · Reglas que la base hace cumplir aunque falle el código:
-- 1) cada parte conciliada es positiva y del tipo que corresponde;
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_tipo_coherente"
  CHECK (("tipo" = 'PAGO' AND "pagoId" IS NOT NULL) OR ("tipo" = 'OTRO_INGRESO' AND "pagoId" IS NULL AND "concepto" IS NOT NULL));
-- 2) un pago tiene como máximo UNA conciliación vigente: la misma plata no se cuenta dos veces.
CREATE UNIQUE INDEX "ConciliacionMovimiento_pago_vigente" ON "ConciliacionMovimiento"("pagoId") WHERE "anuladaEn" IS NULL AND "pagoId" IS NOT NULL;

-- Las transferencias ya conciliadas con PAG-001 (si las hay) pasan a la tabla nueva, sin cambiar montos.
INSERT INTO "ConciliacionMovimiento" ("id", "administradoraId", "condominioId", "movimientoId", "tipo", "monto", "pagoId", "transferenciaId", "creadoPor", "creadoEn")
SELECT 'cm' || replace(gen_random_uuid()::text, '-', ''), t."administradoraId", t."condominioId", t."movimientoId", 'PAGO', p."monto", t."pagoId", t."id",
       coalesce(t."revisadoPor", 'Convive'), coalesce(t."revisadoEn", CURRENT_TIMESTAMP)
FROM "TransferenciaInformada" t
JOIN "Pago" p ON p."id" = t."pagoId"
WHERE t."estado" = 'CONCILIADA' AND t."movimientoId" IS NOT NULL AND p."anuladoEn" IS NULL;
