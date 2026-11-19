-- FIN-003.3 · Verificación automática de transferencias informadas con la cartola.
-- Aditiva: columnas nuevas con valor por defecto o vacías y una tabla nueva. No toca datos existentes.

-- CreateEnum
CREATE TYPE "ResultadoVerificacionAuto" AS ENUM ('VERIFICADA', 'POR_CONFIRMAR', 'CON_DIFERENCIAS');

-- AlterTable
ALTER TABLE "Condominio" ADD COLUMN "verificacionAutomatica" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TransferenciaInformada" ADD COLUMN "autoEn" TIMESTAMP(3),
ADD COLUMN "autoMotivos" TEXT,
ADD COLUMN "autoMovimientoId" TEXT,
ADD COLUMN "autoResultado" "ResultadoVerificacionAuto";

-- CreateTable
CREATE TABLE "VerificacionCartola" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "importacionId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "revisadas" INTEGER NOT NULL,
    "verificadas" INTEGER NOT NULL,
    "porConfirmar" INTEGER NOT NULL,
    "conDiferencias" INTEGER NOT NULL,
    "sinTransferencia" INTEGER NOT NULL,
    "detalle" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificacionCartola_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificacionCartola_condominioId_creadoEn_idx" ON "VerificacionCartola"("condominioId", "creadoEn");

-- CreateIndex
CREATE INDEX "VerificacionCartola_importacionId_idx" ON "VerificacionCartola"("importacionId");

-- AddForeignKey
ALTER TABLE "VerificacionCartola" ADD CONSTRAINT "VerificacionCartola_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
