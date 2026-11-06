-- SEG-25 (cambio 8): registro de cambios más completo. Solo agrega columnas y un índice; no borra ni
-- modifica datos. Quita la relación con Administradora para que el historial se conserve
-- aunque se elimine una administradora (antes se borraba junto con ella).

-- DropForeignKey
ALTER TABLE "RegistroCambio" DROP CONSTRAINT "RegistroCambio_administradoraId_fkey";

-- AlterTable
ALTER TABLE "RegistroCambio" ADD COLUMN     "antes" JSONB,
ADD COLUMN     "despues" JSONB,
ADD COLUMN     "entidad" TEXT,
ADD COLUMN     "entidadId" TEXT;

-- CreateIndex
CREATE INDEX "RegistroCambio_entidad_entidadId_idx" ON "RegistroCambio"("entidad", "entidadId");
