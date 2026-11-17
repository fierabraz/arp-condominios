-- PAG-001 · Portal de pagos del residente. Solo agrega columnas y tablas: no cambia ni borra datos.
-- Los avisos ya emitidos reciben su código de pago aleatorio (gen_random_uuid) al aplicar la migración.

-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('INFORMADA', 'EN_REVISION', 'CONCILIADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "AvisoCobro" ADD COLUMN     "codigoPago" TEXT NOT NULL DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text);

-- AlterTable
ALTER TABLE "CuentaBancaria" ADD COLUMN     "correoPagos" TEXT,
ADD COLUMN     "numeroCuenta" TEXT,
ADD COLUMN     "recibePagos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rutTitular" TEXT,
ADD COLUMN     "titular" TEXT,
ADD COLUMN     "verificadaEn" TIMESTAMP(3),
ADD COLUMN     "verificadaPor" TEXT;

-- CreateTable
CREATE TABLE "TransferenciaInformada" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "avisoId" TEXT,
    "cuentaId" TEXT,
    "usuarioId" TEXT,
    "informante" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "bancoOrigen" TEXT,
    "operacion" TEXT,
    "pagadoPor" TEXT,
    "observaciones" TEXT,
    "deudaAlInformar" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'INFORMADA',
    "movimientoId" TEXT,
    "pagoId" TEXT,
    "nota" TEXT,
    "revisadoPor" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaInformada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteTransferencia" (
    "id" TEXT NOT NULL,
    "transferenciaId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "huella" TEXT NOT NULL,
    "datos" BYTEA NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteTransferencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaInformada_pagoId_key" ON "TransferenciaInformada"("pagoId");

-- CreateIndex
CREATE INDEX "TransferenciaInformada_condominioId_estado_creadoEn_idx" ON "TransferenciaInformada"("condominioId", "estado", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaInformada_unidadId_creadoEn_idx" ON "TransferenciaInformada"("unidadId", "creadoEn");

-- CreateIndex
CREATE INDEX "TransferenciaInformada_administradoraId_idx" ON "TransferenciaInformada"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteTransferencia_transferenciaId_key" ON "ComprobanteTransferencia"("transferenciaId");

-- CreateIndex
CREATE INDEX "ComprobanteTransferencia_condominioId_huella_idx" ON "ComprobanteTransferencia"("condominioId", "huella");

-- CreateIndex
CREATE UNIQUE INDEX "AvisoCobro_codigoPago_key" ON "AvisoCobro"("codigoPago");

-- AddForeignKey
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "AvisoCobro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_movimientoId_fkey" FOREIGN KEY ("movimientoId") REFERENCES "MovimientoBancario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteTransferencia" ADD CONSTRAINT "ComprobanteTransferencia_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaInformada"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Un monto informado siempre es positivo.
ALTER TABLE "TransferenciaInformada" ADD CONSTRAINT "TransferenciaInformada_monto_positivo" CHECK ("monto" > 0);
