-- CreateEnum
CREATE TYPE "TipoVinculo" AS ENUM ('PROPIETARIO', 'COPROPIETARIO', 'ARRENDATARIO', 'RESIDENTE', 'OCUPANTE');

-- CreateTable
CREATE TABLE "VinculoUnidad" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "tipo" "TipoVinculo" NOT NULL,
    "desde" DATE,
    "hasta" DATE,
    "terminoPrevisto" DATE,
    "respaldo" TEXT,
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadoPor" TEXT,
    "terminadoEn" TIMESTAMP(3),

    CONSTRAINT "VinculoUnidad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VinculoUnidad_unidadId_idx" ON "VinculoUnidad"("unidadId");

-- CreateIndex
CREATE INDEX "VinculoUnidad_personaId_idx" ON "VinculoUnidad"("personaId");

-- CreateIndex
CREATE INDEX "VinculoUnidad_administradoraId_idx" ON "VinculoUnidad"("administradoraId");

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Los vínculos que ya existían pasan al historial como vigentes, sin fecha de inicio (no se conoce).
-- Solo se copian: UnidadPersona no cambia.
INSERT INTO "VinculoUnidad" ("id", "administradoraId", "unidadId", "personaId", "tipo", "creadoPor")
SELECT gen_random_uuid()::text, u."administradoraId", up."unidadId", up."personaId", up."relacion"::text::"TipoVinculo", 'Registro anterior a COM-001'
FROM "UnidadPersona" up
JOIN "Unidad" u ON u."id" = up."unidadId";
