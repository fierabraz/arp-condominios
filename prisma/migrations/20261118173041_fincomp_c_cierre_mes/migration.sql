-- AlterTable
ALTER TABLE "Periodo" ADD COLUMN     "mesCerradoEn" TIMESTAMP(3),
ADD COLUMN     "mesCerradoPor" TEXT,
ADD COLUMN     "motivoReapertura" TEXT,
ADD COLUMN     "reabiertoEn" TIMESTAMP(3),
ADD COLUMN     "reabiertoPor" TEXT,
ADD COLUMN     "resumenCierre" JSONB;

-- AlterTable
ALTER TABLE "Unidad" ADD COLUMN     "prorrateoProvisional" BOOLEAN NOT NULL DEFAULT false;

-- Solo un mes con avisos emitidos puede quedar cerrado.
ALTER TABLE "Periodo" ADD CONSTRAINT "Periodo_cierre_tras_emision" CHECK ("mesCerradoEn" IS NULL OR "estado" = 'CERRADO');
