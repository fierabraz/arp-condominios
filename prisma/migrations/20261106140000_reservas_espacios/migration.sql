-- RES-001: reserva de espacios comunes. Solo agrega tablas nuevas; no cambia ni borra datos existentes.
-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "CobroReserva" AS ENUM ('SIN_COBRO', 'POR_CARGAR', 'CARGADO', 'ANULADO');

-- CreateTable
CREATE TABLE "EspacioReservable" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "normas" TEXT,
    "capacidad" INTEGER,
    "turnos" TEXT[],
    "costo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requiereAprobacion" BOOLEAN NOT NULL DEFAULT false,
    "anticipacionMaximaDias" INTEGER NOT NULL DEFAULT 60,
    "maximoPorMes" INTEGER,
    "bloquearMorosos" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspacioReservable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "espacioId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "turno" TEXT NOT NULL,
    "estado" "EstadoReserva" NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cobro" "CobroReserva" NOT NULL DEFAULT 'SIN_COBRO',
    "gastoId" TEXT,
    "observaciones" TEXT,
    "solicitadaPor" TEXT NOT NULL,
    "porAdministracion" BOOLEAN NOT NULL DEFAULT false,
    "respondidaPor" TEXT,
    "respondidaEn" TIMESTAMP(3),
    "motivo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EspacioReservable_administradoraId_idx" ON "EspacioReservable"("administradoraId");

-- CreateIndex
CREATE UNIQUE INDEX "EspacioReservable_condominioId_nombre_key" ON "EspacioReservable"("condominioId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Reserva_gastoId_key" ON "Reserva"("gastoId");

-- CreateIndex
CREATE INDEX "Reserva_espacioId_fecha_idx" ON "Reserva"("espacioId", "fecha");

-- CreateIndex
CREATE INDEX "Reserva_unidadId_idx" ON "Reserva"("unidadId");

-- CreateIndex
CREATE INDEX "Reserva_condominioId_estado_idx" ON "Reserva"("condominioId", "estado");

-- AddForeignKey
ALTER TABLE "EspacioReservable" ADD CONSTRAINT "EspacioReservable_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspacioReservable" ADD CONSTRAINT "EspacioReservable_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioReservable"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

