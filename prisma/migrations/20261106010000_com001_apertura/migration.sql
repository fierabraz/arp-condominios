-- COM-001 · Entrega 5: apertura financiera (borrador). Solo agrega tablas y tipos; no modifica datos existentes.

-- CreateEnum
CREATE TYPE "EstadoApertura" AS ENUM ('BORRADOR', 'EN_REVISION');

-- CreateEnum
CREATE TYPE "EstadoDeudaApertura" AS ENUM ('CONFIRMADA', 'DISCUTIDA', 'EN_CONVENIO', 'POR_VERIFICAR');

-- CreateEnum
CREATE TYPE "TipoFondoApertura" AS ENUM ('ORDINARIO', 'RESERVA', 'PROYECTO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoCuentaApertura" AS ENUM ('CORRIENTE', 'VISTA', 'AHORRO', 'CAJA');

-- CreateEnum
CREATE TYPE "TipoObligacionApertura" AS ENUM ('PROVEEDOR', 'REMUNERACION', 'IMPUESTO', 'OTRO');

-- CreateTable
CREATE TABLE "Apertura" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "fechaCorte" DATE NOT NULL,
    "estado" "EstadoApertura" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "preparadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Apertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeudaApertura" (
    "id" TEXT NOT NULL,
    "aperturaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "montoOriginal" INTEGER,
    "abonos" INTEGER,
    "saldo" INTEGER NOT NULL,
    "vencimiento" DATE,
    "estado" "EstadoDeudaApertura" NOT NULL DEFAULT 'CONFIRMADA',
    "respaldo" TEXT,
    "observaciones" TEXT,
    "origen" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeudaApertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditoApertura" (
    "id" TEXT NOT NULL,
    "aperturaId" TEXT NOT NULL,
    "unidadId" TEXT,
    "monto" INTEGER NOT NULL,
    "fecha" DATE,
    "descripcion" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditoApertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FondoApertura" (
    "id" TEXT NOT NULL,
    "aperturaId" TEXT NOT NULL,
    "tipo" "TipoFondoApertura" NOT NULL,
    "nombre" TEXT NOT NULL,
    "saldoContable" INTEGER NOT NULL,
    "pendienteRecaudar" INTEGER,
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FondoApertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaApertura" (
    "id" TEXT NOT NULL,
    "aperturaId" TEXT NOT NULL,
    "tipo" "TipoCuentaApertura" NOT NULL,
    "banco" TEXT NOT NULL,
    "numeroFinal" TEXT,
    "titular" TEXT,
    "saldoCartola" INTEGER NOT NULL,
    "chequesNoCobrados" INTEGER NOT NULL DEFAULT 0,
    "depositosNoAbonados" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaApertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligacionApertura" (
    "id" TEXT NOT NULL,
    "aperturaId" TEXT NOT NULL,
    "tipo" "TipoObligacionApertura" NOT NULL,
    "acreedor" TEXT NOT NULL,
    "proveedorId" TEXT,
    "documento" TEXT,
    "fecha" DATE,
    "vencimiento" DATE,
    "monto" INTEGER NOT NULL,
    "fondo" TEXT,
    "observaciones" TEXT,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObligacionApertura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Apertura_condominioId_key" ON "Apertura"("condominioId");

-- CreateIndex
CREATE INDEX "DeudaApertura_unidadId_idx" ON "DeudaApertura"("unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "DeudaApertura_aperturaId_unidadId_periodo_concepto_key" ON "DeudaApertura"("aperturaId", "unidadId", "periodo", "concepto");

-- CreateIndex
CREATE INDEX "CreditoApertura_unidadId_idx" ON "CreditoApertura"("unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "FondoApertura_aperturaId_nombre_key" ON "FondoApertura"("aperturaId", "nombre");

-- AddForeignKey
ALTER TABLE "Apertura" ADD CONSTRAINT "Apertura_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apertura" ADD CONSTRAINT "Apertura_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaApertura" ADD CONSTRAINT "DeudaApertura_aperturaId_fkey" FOREIGN KEY ("aperturaId") REFERENCES "Apertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeudaApertura" ADD CONSTRAINT "DeudaApertura_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditoApertura" ADD CONSTRAINT "CreditoApertura_aperturaId_fkey" FOREIGN KEY ("aperturaId") REFERENCES "Apertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditoApertura" ADD CONSTRAINT "CreditoApertura_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FondoApertura" ADD CONSTRAINT "FondoApertura_aperturaId_fkey" FOREIGN KEY ("aperturaId") REFERENCES "Apertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaApertura" ADD CONSTRAINT "CuentaApertura_aperturaId_fkey" FOREIGN KEY ("aperturaId") REFERENCES "Apertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligacionApertura" ADD CONSTRAINT "ObligacionApertura_aperturaId_fkey" FOREIGN KEY ("aperturaId") REFERENCES "Apertura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligacionApertura" ADD CONSTRAINT "ObligacionApertura_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

