-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "anuladoEn" TIMESTAMP(3),
ADD COLUMN     "anuladoPor" TEXT,
ADD COLUMN     "motivoAnulacion" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "accesoTodas" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AsignacionCondominio" (
    "usuarioId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionCondominio_pkey" PRIMARY KEY ("usuarioId","condominioId")
);

-- CreateIndex
CREATE INDEX "AsignacionCondominio_condominioId_idx" ON "AsignacionCondominio"("condominioId");

-- AddForeignKey
ALTER TABLE "AsignacionCondominio" ADD CONSTRAINT "AsignacionCondominio_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionCondominio" ADD CONSTRAINT "AsignacionCondominio_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los administradores que ya existen siguen viendo todas las propiedades, como hasta hoy.
-- Desde Permisos, un administrador principal puede limitar a otros a ciertas propiedades.
UPDATE "Usuario" SET "accesoTodas" = true WHERE "rol" = 'ADMINISTRADOR';
