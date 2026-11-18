-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN     "trabajadorId" TEXT;

-- CreateTable
CREATE TABLE "Trabajador" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "liquido" DECIMAL(14,2) NOT NULL,
    "imposiciones" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trabajador_condominioId_idx" ON "Trabajador"("condominioId");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Montos coherentes: sueldo líquido mayor que cero, imposiciones no negativas.
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_montos_validos" CHECK ("liquido" > 0 AND "imposiciones" >= 0);
