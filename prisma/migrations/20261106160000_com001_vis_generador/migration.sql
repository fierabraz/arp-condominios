-- COM-001-VIS: generador visual. Solo agrega dos tablas nuevas; no modifica ni borra datos existentes.

-- CreateEnum
CREATE TYPE "TipoElementoPlano" AS ENUM ('AGRUPACION', 'UNIDAD', 'ESPACIO', 'INSTALACION');

-- CreateTable
CREATE TABLE "PlanoComunidad" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "respuestas" JSONB NOT NULL,
    "registros" JSONB NOT NULL DEFAULT '{}',
    "generadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanoComunidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementoPlano" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "tipo" "TipoElementoPlano" NOT NULL,
    "registroId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElementoPlano_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanoComunidad_condominioId_key" ON "PlanoComunidad"("condominioId");

-- CreateIndex
CREATE INDEX "PlanoComunidad_administradoraId_idx" ON "PlanoComunidad"("administradoraId");

-- CreateIndex
CREATE INDEX "ElementoPlano_administradoraId_idx" ON "ElementoPlano"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "ElementoPlano_condominioId_tipo_registroId_key" ON "ElementoPlano"("condominioId", "tipo", "registroId");

-- AddForeignKey
ALTER TABLE "PlanoComunidad" ADD CONSTRAINT "PlanoComunidad_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementoPlano" ADD CONSTRAINT "ElementoPlano_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

