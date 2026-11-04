-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "claveActualizadaEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IntentoIngreso" (
    "id" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "ip" TEXT,
    "exitoso" BOOLEAN NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenRecuperacion" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRecuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroCambio" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT,
    "condominioId" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroCambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoIngreso_correo_creadoEn_idx" ON "IntentoIngreso"("correo", "creadoEn");

-- CreateIndex
CREATE INDEX "IntentoIngreso_ip_creadoEn_idx" ON "IntentoIngreso"("ip", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "TokenRecuperacion_tokenHash_key" ON "TokenRecuperacion"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenRecuperacion_usuarioId_idx" ON "TokenRecuperacion"("usuarioId");

-- CreateIndex
CREATE INDEX "RegistroCambio_administradoraId_creadoEn_idx" ON "RegistroCambio"("administradoraId", "creadoEn");

-- CreateIndex
CREATE INDEX "RegistroCambio_condominioId_creadoEn_idx" ON "RegistroCambio"("condominioId", "creadoEn");

-- AddForeignKey
ALTER TABLE "TokenRecuperacion" ADD CONSTRAINT "TokenRecuperacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroCambio" ADD CONSTRAINT "RegistroCambio_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;
