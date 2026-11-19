-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('PENDIENTE', 'SUGERIDA', 'CONCILIADO', 'REVISAR');

-- CreateEnum
CREATE TYPE "EstadoImportacionCartola" AS ENUM ('APLICADA');

-- CreateTable
CREATE TABLE "CuentaBancaria" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipo" "TipoCuentaApertura" NOT NULL DEFAULT 'CORRIENTE',
    "numeroFinal" TEXT NOT NULL,
    "alias" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionCartola" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "archivoHuella" TEXT NOT NULL,
    "archivoTamano" INTEGER NOT NULL,
    "formato" TEXT NOT NULL,
    "hojas" TEXT[],
    "perfilNombre" TEXT,
    "desde" DATE,
    "hasta" DATE,
    "encontrados" INTEGER NOT NULL,
    "nuevos" INTEGER NOT NULL,
    "yaRegistrados" INTEGER NOT NULL,
    "posiblesDuplicados" INTEGER NOT NULL,
    "duplicadosOmitidos" INTEGER NOT NULL,
    "errores" INTEGER NOT NULL,
    "detalleErrores" JSONB,
    "estado" "EstadoImportacionCartola" NOT NULL,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacionCartola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoBancario" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "importacionId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT,
    "referencia" TEXT,
    "monto" DECIMAL(16,2) NOT NULL,
    "saldo" DECIMAL(16,2),
    "contraparte" TEXT,
    "rutContraparte" TEXT,
    "otros" JSONB,
    "hoja" TEXT,
    "fila" INTEGER,
    "huella" TEXT NOT NULL,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
    "nota" TEXT,
    "montoConciliado" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilCartola" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "columnas" JSONB NOT NULL,
    "hoja" TEXT,
    "formatoFecha" TEXT NOT NULL DEFAULT 'AUTO',
    "separadorDecimal" TEXT NOT NULL DEFAULT 'AUTO',
    "signoMonto" TEXT NOT NULL DEFAULT 'POSITIVO_ABONO',
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilCartola_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuentaBancaria_administradoraId_idx" ON "CuentaBancaria"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaBancaria_condominioId_banco_numeroFinal_key" ON "CuentaBancaria"("condominioId", "banco", "numeroFinal");

-- CreateIndex
CREATE INDEX "ImportacionCartola_cuentaId_creadoEn_idx" ON "ImportacionCartola"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "ImportacionCartola_cuentaId_archivoHuella_idx" ON "ImportacionCartola"("cuentaId", "archivoHuella");

-- CreateIndex
CREATE INDEX "ImportacionCartola_condominioId_idx" ON "ImportacionCartola"("condominioId");

-- CreateIndex
CREATE INDEX "MovimientoBancario_cuentaId_fecha_idx" ON "MovimientoBancario"("cuentaId", "fecha");

-- CreateIndex
CREATE INDEX "MovimientoBancario_condominioId_idx" ON "MovimientoBancario"("condominioId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoBancario_cuentaId_huella_key" ON "MovimientoBancario"("cuentaId", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilCartola_administradoraId_nombre_key" ON "PerfilCartola"("administradoraId", "nombre");

-- AddForeignKey
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionCartola" ADD CONSTRAINT "ImportacionCartola_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBancario" ADD CONSTRAINT "MovimientoBancario_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoBancario" ADD CONSTRAINT "MovimientoBancario_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionCartola"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilCartola" ADD CONSTRAINT "PerfilCartola_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FIN-003.1: reglas que la base hace cumplir aunque falle el programa.
-- Un movimiento nunca vale 0 y lo conciliado no puede pasar del monto del movimiento (FIN-003.2).
ALTER TABLE "MovimientoBancario" ADD CONSTRAINT "MovimientoBancario_monto_no_cero" CHECK ("monto" <> 0);
ALTER TABLE "MovimientoBancario" ADD CONSTRAINT "MovimientoBancario_conciliado_dentro_del_monto"
  CHECK (abs("montoConciliado") <= abs("monto") AND sign("montoConciliado") * sign("monto") >= 0);
-- Solo los últimos 4 dígitos de la cuenta.
ALTER TABLE "CuentaBancaria" ADD CONSTRAINT "CuentaBancaria_numero_final" CHECK ("numeroFinal" ~ '^[0-9]{4}$');
