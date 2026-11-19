-- CreateTable
CREATE TABLE "CertificadoAlDia" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "huella" TEXT NOT NULL,
    "emitidoPor" TEXT NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificadoAlDia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoAlDia_folio_key" ON "CertificadoAlDia"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoAlDia_codigo_key" ON "CertificadoAlDia"("codigo");

-- CreateIndex
CREATE INDEX "CertificadoAlDia_unidadId_emitidoEn_idx" ON "CertificadoAlDia"("unidadId", "emitidoEn");

-- CreateIndex
CREATE INDEX "CertificadoAlDia_condominioId_idx" ON "CertificadoAlDia"("condominioId");

-- AddForeignKey
ALTER TABLE "CertificadoAlDia" ADD CONSTRAINT "CertificadoAlDia_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Documento emitido: no se modifica ni se borra (misma regla que las constancias de pago).
CREATE TRIGGER "CertificadoAlDia_inmutable" BEFORE UPDATE OR DELETE ON "CertificadoAlDia"
  FOR EACH ROW EXECUTE FUNCTION "constancia_inmutable"();
