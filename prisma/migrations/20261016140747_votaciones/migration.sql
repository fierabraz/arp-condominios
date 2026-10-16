-- CreateEnum
CREATE TYPE "EstadoVotacion" AS ENUM ('BORRADOR', 'ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "PonderacionVoto" AS ENUM ('ALICUOTA', 'UNIDAD');

-- CreateTable
CREATE TABLE "Votacion" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoVotacion" NOT NULL DEFAULT 'BORRADOR',
    "ponderacion" "PonderacionVoto" NOT NULL DEFAULT 'ALICUOTA',
    "cierraEn" TIMESTAMP(3) NOT NULL,
    "publicadaEn" TIMESTAMP(3),
    "cerradaEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Votacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionVotacion" (
    "id" TEXT NOT NULL,
    "votacionId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "OpcionVotacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voto" (
    "id" TEXT NOT NULL,
    "votacionId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "emitidoPor" TEXT NOT NULL,
    "presencial" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Votacion_condominioId_estado_idx" ON "Votacion"("condominioId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_votacionId_unidadId_key" ON "Voto"("votacionId", "unidadId");

-- AddForeignKey
ALTER TABLE "Votacion" ADD CONSTRAINT "Votacion_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votacion" ADD CONSTRAINT "Votacion_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionVotacion" ADD CONSTRAINT "OpcionVotacion_votacionId_fkey" FOREIGN KEY ("votacionId") REFERENCES "Votacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_votacionId_fkey" FOREIGN KEY ("votacionId") REFERENCES "Votacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "OpcionVotacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
