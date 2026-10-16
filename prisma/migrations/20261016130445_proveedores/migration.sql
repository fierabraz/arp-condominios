-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT,
    "rubro" TEXT,
    "contacto" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_administradoraId_nombre_key" ON "Proveedor"("administradoraId", "nombre");

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_administradoraId_fkey" FOREIGN KEY ("administradoraId") REFERENCES "Administradora"("id") ON DELETE CASCADE ON UPDATE CASCADE;
