-- AlterEnum
ALTER TYPE "EstadoApertura" ADD VALUE 'INCORPORADA';

-- AlterTable
ALTER TABLE "Apertura" ADD COLUMN     "incorporadaEn" TIMESTAMP(3),
ADD COLUMN     "incorporadaPor" TEXT;

-- AlterTable
ALTER TABLE "Periodo" ADD COLUMN     "deApertura" BOOLEAN NOT NULL DEFAULT false;
