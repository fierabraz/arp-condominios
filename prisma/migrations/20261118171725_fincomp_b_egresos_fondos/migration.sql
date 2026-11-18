-- CreateEnum
CREATE TYPE "EstadoPagoGasto" AS ENUM ('POR_PAGAR', 'PAGADO');

-- CreateEnum
CREATE TYPE "TipoFondo" AS ENUM ('RESERVA', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoMovimientoFondo" AS ENUM ('APORTE', 'RETIRO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoConciliacion" ADD VALUE 'EGRESO';
ALTER TYPE "TipoConciliacion" ADD VALUE 'OTRO_EGRESO';

-- AlterTable
ALTER TABLE "ConciliacionMovimiento" ADD COLUMN     "gastoId" TEXT;

-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN     "estadoPago" "EstadoPagoGasto" NOT NULL DEFAULT 'POR_PAGAR',
ADD COLUMN     "fechaPago" DATE,
ADD COLUMN     "fondoId" TEXT,
ADD COLUMN     "medioPago" "MedioPago",
ADD COLUMN     "pagadoPor" TEXT,
ADD COLUMN     "proveedorId" TEXT;

-- CreateTable
CREATE TABLE "RespaldoGasto" (
    "id" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "huella" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "subidoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespaldoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fondo" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoFondo" NOT NULL,
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fondo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoFondo" (
    "id" TEXT NOT NULL,
    "fondoId" TEXT NOT NULL,
    "tipo" "TipoMovimientoFondo" NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPor" TEXT,

    CONSTRAINT "MovimientoFondo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RespaldoGasto_gastoId_idx" ON "RespaldoGasto"("gastoId");

-- CreateIndex
CREATE INDEX "Fondo_administradoraId_idx" ON "Fondo"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Fondo_condominioId_nombre_key" ON "Fondo"("condominioId", "nombre");

-- CreateIndex
CREATE INDEX "MovimientoFondo_fondoId_fecha_idx" ON "MovimientoFondo"("fondoId", "fecha");

-- CreateIndex
CREATE INDEX "ConciliacionMovimiento_gastoId_idx" ON "ConciliacionMovimiento"("gastoId");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_fondoId_fkey" FOREIGN KEY ("fondoId") REFERENCES "Fondo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespaldoGasto" ADD CONSTRAINT "RespaldoGasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFondo" ADD CONSTRAINT "MovimientoFondo_fondoId_fkey" FOREIGN KEY ("fondoId") REFERENCES "Fondo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIN-COMP B · Reglas en la base.
ALTER TABLE "ConciliacionMovimiento" DROP CONSTRAINT "ConciliacionMovimiento_tipo_coherente";
ALTER TABLE "ConciliacionMovimiento" ADD CONSTRAINT "ConciliacionMovimiento_tipo_coherente" CHECK (
  ("tipo" = 'PAGO' AND "pagoId" IS NOT NULL AND "gastoId" IS NULL) OR
  ("tipo" = 'OTRO_INGRESO' AND "pagoId" IS NULL AND "gastoId" IS NULL AND "concepto" IS NOT NULL) OR
  ("tipo" = 'EGRESO' AND "gastoId" IS NOT NULL AND "pagoId" IS NULL) OR
  ("tipo" = 'OTRO_EGRESO' AND "pagoId" IS NULL AND "gastoId" IS NULL AND "concepto" IS NOT NULL)
);
-- Un egreso con como máximo una conciliación vigente (igual que los pagos).
CREATE UNIQUE INDEX "ConciliacionMovimiento_gasto_vigente" ON "ConciliacionMovimiento"("gastoId") WHERE "anuladaEn" IS NULL AND "gastoId" IS NOT NULL;
-- Egreso pagado = con fecha de pago.
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_pago_coherente" CHECK (("estadoPago" = 'PAGADO') = ("fechaPago" IS NOT NULL));
ALTER TABLE "MovimientoFondo" ADD CONSTRAINT "MovimientoFondo_monto_positivo" CHECK ("monto" > 0);
-- Los gastos que ya existían se consideran pagados en la fecha del gasto (antes no se registraba
-- el pago; así no aparecen de golpe como deudas con proveedores).
UPDATE "Gasto" SET "estadoPago" = 'PAGADO', "fechaPago" = "fecha"::date, "pagadoPor" = 'Migración FIN-COMP B (gasto anterior)';
