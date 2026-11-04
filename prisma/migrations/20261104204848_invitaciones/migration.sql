-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('RECUPERACION', 'INVITACION');

-- AlterTable
ALTER TABLE "TokenRecuperacion" ADD COLUMN     "tipo" "TipoToken" NOT NULL DEFAULT 'RECUPERACION';
