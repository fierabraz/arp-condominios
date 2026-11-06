-- COM-001 · Entrega 4: perfiles de planillas propias por administradora. Solo agrega una tabla.

-- CreateTable
CREATE TABLE "PerfilImportacion" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "columnas" JSONB NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PerfilImportacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerfilImportacion_administradoraId_nombre_key" ON "PerfilImportacion"("administradoraId", "nombre");

-- AddForeignKey
ALTER TABLE "PerfilImportacion" ADD CONSTRAINT "PerfilImportacion_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;

