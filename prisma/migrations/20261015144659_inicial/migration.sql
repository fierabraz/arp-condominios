-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPERADMIN', 'ADMINISTRADOR', 'COMITE', 'RESIDENTE');

-- CreateEnum
CREATE TYPE "TipoUnidad" AS ENUM ('DEPARTAMENTO', 'CASA', 'OFICINA', 'LOCAL', 'ESTACIONAMIENTO', 'BODEGA');

-- CreateEnum
CREATE TYPE "RelacionUnidad" AS ENUM ('PROPIETARIO', 'RESIDENTE');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoGasto" AS ENUM ('COMUN', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'OTRO');

-- CreateTable
CREATE TABLE "Administradora" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pais" TEXT NOT NULL DEFAULT 'CL',
    "moneda" TEXT NOT NULL DEFAULT 'CLP',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Administradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "claveHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "condominioId" TEXT,
    "personaId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condominio" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "comuna" TEXT,
    "porcentajeReserva" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "tasaInteresMora" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "diaVencimiento" INTEGER NOT NULL DEFAULT 10,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Condominio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidad" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoUnidad" NOT NULL DEFAULT 'DEPARTAMENTO',
    "alicuota" DECIMAL(9,6) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadPersona" (
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "relacion" "RelacionUnidad" NOT NULL,

    CONSTRAINT "UnidadPersona_pkey" PRIMARY KEY ("unidadId","personaId","relacion")
);

-- CreateTable
CREATE TABLE "Periodo" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'ABIERTO',
    "vencimiento" TIMESTAMP(3),
    "cerradoEn" TIMESTAMP(3),

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "tipo" "TipoGasto" NOT NULL,
    "unidadId" TEXT,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "proveedor" TEXT,
    "documento" TEXT,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvisoCobro" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "periodoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "gastoComun" DECIMAL(14,2) NOT NULL,
    "fondoReserva" DECIMAL(14,2) NOT NULL,
    "cargos" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "referencia" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionPago" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "AplicacionPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_personaId_key" ON "Usuario"("personaId");

-- CreateIndex
CREATE INDEX "Usuario_administradoraId_idx" ON "Usuario"("administradoraId");

-- CreateIndex
CREATE INDEX "Condominio_administradoraId_idx" ON "Condominio"("administradoraId");

-- CreateIndex
CREATE INDEX "Persona_administradoraId_idx" ON "Persona"("administradoraId");

-- CreateIndex
CREATE INDEX "Unidad_administradoraId_idx" ON "Unidad"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Unidad_condominioId_numero_key" ON "Unidad"("condominioId", "numero");

-- CreateIndex
CREATE INDEX "Periodo_administradoraId_idx" ON "Periodo"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_condominioId_anio_mes_key" ON "Periodo"("condominioId", "anio", "mes");

-- CreateIndex
CREATE INDEX "Gasto_administradoraId_idx" ON "Gasto"("administradoraId");

-- CreateIndex
CREATE INDEX "Gasto_periodoId_idx" ON "Gasto"("periodoId");

-- CreateIndex
CREATE INDEX "AvisoCobro_administradoraId_idx" ON "AvisoCobro"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "AvisoCobro_periodoId_unidadId_key" ON "AvisoCobro"("periodoId", "unidadId");

-- CreateIndex
CREATE INDEX "Pago_administradoraId_idx" ON "Pago"("administradoraId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condominio" ADD CONSTRAINT "Condominio_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadPersona" ADD CONSTRAINT "UnidadPersona_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadPersona" ADD CONSTRAINT "UnidadPersona_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Periodo" ADD CONSTRAINT "Periodo_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Periodo" ADD CONSTRAINT "Periodo_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoCobro" ADD CONSTRAINT "AvisoCobro_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoCobro" ADD CONSTRAINT "AvisoCobro_periodoId_fkey" FOREIGN KEY ("periodoId") REFERENCES "Periodo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoCobro" ADD CONSTRAINT "AvisoCobro_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "AvisoCobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
