-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('ENVIADO', 'SIMULADO', 'ERROR');

-- CreateTable
CREATE TABLE "EnvioAviso" (
    "id" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "estado" "EstadoEnvio" NOT NULL,
    "error" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioAviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnvioAviso_avisoId_idx" ON "EnvioAviso"("avisoId");

-- AddForeignKey
ALTER TABLE "EnvioAviso" ADD CONSTRAINT "EnvioAviso_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "AvisoCobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
