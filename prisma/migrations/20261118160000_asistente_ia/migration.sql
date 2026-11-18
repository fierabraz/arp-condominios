-- CreateTable
CREATE TABLE "ConsultaAsistente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "administradoraId" TEXT,
    "rol" "Rol" NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheLectura" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheEscritura" INTEGER NOT NULL DEFAULT 0,
    "exitosa" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaAsistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultaAsistente_usuarioId_creadoEn_idx" ON "ConsultaAsistente"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "ConsultaAsistente_creadoEn_idx" ON "ConsultaAsistente"("creadoEn");

