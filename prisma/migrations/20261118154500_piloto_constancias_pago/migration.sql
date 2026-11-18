-- CreateTable
CREATE TABLE "ConstanciaPago" (
    "id" TEXT NOT NULL,
    "folio" SERIAL NOT NULL,
    "administradoraId" TEXT NOT NULL,
    "condominioId" TEXT NOT NULL,
    "transferenciaId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstanciaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstanciaVersion" (
    "id" TEXT NOT NULL,
    "constanciaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL,
    "datos" JSONB NOT NULL,
    "huella" TEXT NOT NULL,
    "generadaPor" TEXT NOT NULL,
    "generadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstanciaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConstanciaPago_folio_key" ON "ConstanciaPago"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "ConstanciaPago_transferenciaId_key" ON "ConstanciaPago"("transferenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstanciaPago_codigo_key" ON "ConstanciaPago"("codigo");

-- CreateIndex
CREATE INDEX "ConstanciaPago_condominioId_idx" ON "ConstanciaPago"("condominioId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstanciaVersion_constanciaId_version_key" ON "ConstanciaVersion"("constanciaId", "version");

-- AddForeignKey
ALTER TABLE "ConstanciaPago" ADD CONSTRAINT "ConstanciaPago_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaInformada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstanciaVersion" ADD CONSTRAINT "ConstanciaVersion_constanciaId_fkey" FOREIGN KEY ("constanciaId") REFERENCES "ConstanciaPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PILOTO-001 · Las constancias son documentos emitidos: no se modifican ni se borran.
-- Solo las pruebas automáticas pueden borrar, y solo si activan en su transacción
-- `SET LOCAL convive.borrar_constancias = 'si'` (la aplicación nunca lo hace).
CREATE FUNCTION "constancia_inmutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('convive.borrar_constancias', true) = 'si' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'ConstanciaPago'
     AND NEW."folio" = OLD."folio" AND NEW."codigo" = OLD."codigo"
     AND NEW."transferenciaId" = OLD."transferenciaId" AND NEW."condominioId" = OLD."condominioId" THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Las constancias de pago emitidas no se modifican ni se borran (%).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConstanciaPago_inmutable" BEFORE UPDATE OR DELETE ON "ConstanciaPago"
  FOR EACH ROW EXECUTE FUNCTION "constancia_inmutable"();
CREATE TRIGGER "ConstanciaVersion_inmutable" BEFORE UPDATE OR DELETE ON "ConstanciaVersion"
  FOR EACH ROW EXECUTE FUNCTION "constancia_inmutable"();

ALTER TABLE "ConstanciaVersion" ADD CONSTRAINT "ConstanciaVersion_version_positiva" CHECK ("version" >= 1);
