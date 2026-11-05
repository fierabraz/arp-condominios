-- COM-001 · Entrega 1: estado de configuración y datos de identificación de la comunidad.
-- Solo agrega columnas (nada se borra ni se cambia). Las propiedades que ya existían
-- quedan "HABILITADA_FINANCIERA" para que sigan funcionando igual; las nuevas nacen
-- "EN_CONFIGURACION".

CREATE TYPE "EstadoComunidad" AS ENUM ('EN_CONFIGURACION', 'HABILITADA_ADMINISTRATIVA', 'HABILITADA_FINANCIERA');
CREATE TYPE "TipoComunidad" AS ENUM ('EDIFICIO', 'CONDOMINIO_CASAS', 'MIXTO', 'OFICINAS', 'OTRO');
CREATE TYPE "ModalidadIncorporacion" AS ENUM ('NUEVA', 'EXISTENTE');

ALTER TABLE "Condominio"
  ADD COLUMN "estado" "EstadoComunidad" NOT NULL DEFAULT 'HABILITADA_FINANCIERA',
  ADD COLUMN "estadoCambiadoEn" TIMESTAMP(3),
  ADD COLUMN "tipo" "TipoComunidad",
  ADD COLUMN "modalidad" "ModalidadIncorporacion",
  ADD COLUMN "region" TEXT,
  ADD COLUMN "fechaIncorporacion" DATE,
  ADD COLUMN "reglamento" TEXT,
  ADD COLUMN "observaciones" TEXT;

-- Desde ahora, las propiedades nuevas parten en configuración.
ALTER TABLE "Condominio" ALTER COLUMN "estado" SET DEFAULT 'EN_CONFIGURACION';
