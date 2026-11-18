-- CreateEnum
CREATE TYPE "CargoEquipo" AS ENUM ('SUBADMINISTRADOR', 'ASISTENTE', 'CONSERJE', 'PERSONAL');

-- CreateEnum
CREATE TYPE "RelacionDeclarada" AS ENUM ('PROPIETARIO_RESIDENTE', 'PROPIETARIO_NO_RESIDENTE', 'ARRENDATARIO', 'OCUPANTE_AUTORIZADO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "TipoToken" ADD VALUE 'VERIFICACION';

-- AlterTable
ALTER TABLE "Condominio" ADD COLUMN     "codigoIncorporacion" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "cargo" "CargoEquipo",
ADD COLUMN     "codigoRegistroId" TEXT,
ADD COLUMN     "correoVerificadoEn" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "permisosExtra" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "CodigoRegistro" (
    "id" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "correo" TEXT,
    "tokenHash" TEXT NOT NULL,
    "usosMaximos" INTEGER NOT NULL DEFAULT 1,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "anuladoEn" TIMESTAMP(3),
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudVinculo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "unidadTexto" TEXT NOT NULL,
    "relacion" "RelacionDeclarada" NOT NULL,
    "mensaje" TEXT,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "unidadId" TEXT,
    "personaId" TEXT,
    "motivo" TEXT,
    "revisadoPorNombre" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoRegistro_tokenHash_key" ON "CodigoRegistro"("tokenHash");

-- CreateIndex
CREATE INDEX "SolicitudVinculo_condominioId_estado_idx" ON "SolicitudVinculo"("condominioId", "estado");

-- CreateIndex
CREATE INDEX "SolicitudVinculo_usuarioId_idx" ON "SolicitudVinculo"("usuarioId");

-- CreateIndex
CREATE INDEX "SolicitudVinculo_administradoraId_idx" ON "SolicitudVinculo"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Condominio_codigoIncorporacion_key" ON "Condominio"("codigoIncorporacion");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_codigoRegistroId_fkey" FOREIGN KEY ("codigoRegistroId") REFERENCES "CodigoRegistro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudVinculo" ADD CONSTRAINT "SolicitudVinculo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudVinculo" ADD CONSTRAINT "SolicitudVinculo_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudVinculo" ADD CONSTRAINT "SolicitudVinculo_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudVinculo" ADD CONSTRAINT "SolicitudVinculo_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudVinculo" ADD CONSTRAINT "SolicitudVinculo_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- PILOTO-001: las cuentas que ya existen las creó la plataforma o la administración (o se activaron
-- con una invitación por correo): se dan por verificadas. Solo las cuentas nuevas creadas por la
-- propia persona deben confirmar su correo.
UPDATE "Usuario" SET "correoVerificadoEn" = "creadoEn" WHERE "correoVerificadoEn" IS NULL;

-- Una sola solicitud pendiente por cuenta y comunidad.
CREATE UNIQUE INDEX "SolicitudVinculo_pendiente_unica" ON "SolicitudVinculo"("usuarioId", "condominioId") WHERE "estado" = 'PENDIENTE';
