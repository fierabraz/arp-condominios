-- COM-001 · Entrega 2: estructura física (agrupaciones, estacionamientos y bodegas, asignaciones de uso, instalaciones).
-- Solo agrega tablas y una columna opcional en Unidad: nada se borra ni se cambia.

-- CreateEnum
CREATE TYPE "TipoAgrupacion" AS ENUM ('SECTOR', 'TORRE', 'EDIFICIO', 'PISO', 'NIVEL', 'OTRO');

-- CreateEnum
CREATE TYPE "ClaseEspacio" AS ENUM ('ESTACIONAMIENTO', 'BODEGA');

-- CreateEnum
CREATE TYPE "RegimenEspacio" AS ENUM ('UNIDAD_PRIVADA', 'ACCESORIO', 'BIEN_COMUN', 'POR_DEFINIR');

-- CreateEnum
CREATE TYPE "DestinoEspacio" AS ENUM ('PRIVADO', 'VISITAS', 'USO_COMUN', 'SERVICIO');

-- CreateEnum
CREATE TYPE "EstadoEspacio" AS ENUM ('DISPONIBLE', 'ASIGNADO', 'FUERA_DE_USO');

-- CreateEnum
CREATE TYPE "TipoAsignacion" AS ENUM ('PERMANENTE', 'TEMPORAL');

-- CreateEnum
CREATE TYPE "TipoInstalacion" AS ENUM ('ASCENSOR', 'BOMBA', 'PORTON', 'CAMARA', 'ELECTRICO', 'SANITARIO', 'CONTRA_INCENDIOS', 'ESPACIO_COMUN', 'EQUIPAMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoInstalacion" AS ENUM ('OPERATIVA', 'CON_OBSERVACIONES', 'FUERA_DE_SERVICIO', 'SIN_INFORMACION');

-- AlterTable
ALTER TABLE "Unidad" ADD COLUMN     "agrupacionId" TEXT;

-- CreateTable
CREATE TABLE "Agrupacion" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "tipo" "TipoAgrupacion" NOT NULL,
    "nombre" TEXT NOT NULL,
    "padreId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agrupacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Espacio" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "clase" "ClaseEspacio" NOT NULL,
    "codigo" TEXT NOT NULL,
    "agrupacionId" TEXT,
    "ubicacion" TEXT,
    "regimen" "RegimenEspacio" NOT NULL DEFAULT 'POR_DEFINIR',
    "destino" "DestinoEspacio",
    "accesible" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'DISPONIBLE',
    "unidadPropiaId" TEXT,
    "unidadPrincipalId" TEXT,
    "respaldo" TEXT,
    "observaciones" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Espacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsignacionEspacio" (
    "id" TEXT NOT NULL,
    "espacioId" TEXT NOT NULL,
    "tipo" "TipoAsignacion" NOT NULL,
    "unidadId" TEXT,
    "personaId" TEXT,
    "beneficiario" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "respaldo" TEXT,
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadaPor" TEXT,
    "terminadaEn" TIMESTAMP(3),

    CONSTRAINT "AsignacionEspacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instalacion" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "tipo" "TipoInstalacion" NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "agrupacionId" TEXT,
    "ubicacion" TEXT,
    "descripcion" TEXT,
    "estado" "EstadoInstalacion" NOT NULL DEFAULT 'SIN_INFORMACION',
    "proveedorId" TEXT,
    "observaciones" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instalacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agrupacion_administradoraId_idx" ON "Agrupacion"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Agrupacion_condominioId_padreId_nombre_key" ON "Agrupacion"("condominioId", "padreId", "nombre");

-- CreateIndex
CREATE INDEX "Espacio_administradoraId_idx" ON "Espacio"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Espacio_condominioId_clase_codigo_key" ON "Espacio"("condominioId", "clase", "codigo");

-- CreateIndex
CREATE INDEX "AsignacionEspacio_espacioId_desde_idx" ON "AsignacionEspacio"("espacioId", "desde");

-- CreateIndex
CREATE INDEX "Instalacion_administradoraId_idx" ON "Instalacion"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Instalacion_condominioId_codigo_key" ON "Instalacion"("condominioId", "codigo");

-- AddForeignKey
ALTER TABLE "Agrupacion" ADD CONSTRAINT "Agrupacion_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agrupacion" ADD CONSTRAINT "Agrupacion_padreId_fkey" FOREIGN KEY ("padreId") REFERENCES "Agrupacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Espacio" ADD CONSTRAINT "Espacio_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Espacio" ADD CONSTRAINT "Espacio_agrupacionId_fkey" FOREIGN KEY ("agrupacionId") REFERENCES "Agrupacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Espacio" ADD CONSTRAINT "Espacio_unidadPropiaId_fkey" FOREIGN KEY ("unidadPropiaId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Espacio" ADD CONSTRAINT "Espacio_unidadPrincipalId_fkey" FOREIGN KEY ("unidadPrincipalId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionEspacio" ADD CONSTRAINT "AsignacionEspacio_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "Espacio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionEspacio" ADD CONSTRAINT "AsignacionEspacio_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsignacionEspacio" ADD CONSTRAINT "AsignacionEspacio_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instalacion" ADD CONSTRAINT "Instalacion_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instalacion" ADD CONSTRAINT "Instalacion_agrupacionId_fkey" FOREIGN KEY ("agrupacionId") REFERENCES "Agrupacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instalacion" ADD CONSTRAINT "Instalacion_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_agrupacionId_fkey" FOREIGN KEY ("agrupacionId") REFERENCES "Agrupacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

