-- PLA-002: planes por administradora. Solo agrega; las administradoras existentes quedan sin plan (sin límite, como antes).

-- AlterTable
ALTER TABLE "Administradora" ADD COLUMN     "creaComunidades" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "planId" TEXT;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "maxComunidades" INTEGER,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_nombre_key" ON "Plan"("nombre");

-- AddForeignKey
ALTER TABLE "Administradora" ADD CONSTRAINT "Administradora_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Planes iniciales: nombres y cupos PRELIMINARES, editables desde la plataforma (/plataforma/planes).
INSERT INTO "Plan" ("id", "nombre", "descripcion", "maxComunidades", "orden", "activo", "actualizadoEn") VALUES
  ('plan_esencial',     'Esencial',     'Preliminar: 1 comunidad.',     1,    1, true, CURRENT_TIMESTAMP),
  ('plan_esencial_pro', 'Esencial Pro', 'Preliminar: hasta 3 comunidades.',  3,    2, true, CURRENT_TIMESTAMP),
  ('plan_gestion',      'Gestión',      'Preliminar: hasta 10 comunidades.', 10,   3, true, CURRENT_TIMESTAMP),
  ('plan_gestion_pro',  'Gestión Pro',  'Preliminar: hasta 25 comunidades.', 25,   4, true, CURRENT_TIMESTAMP),
  ('plan_integral',     'Integral',     'Preliminar: hasta 50 comunidades.', 50,   5, true, CURRENT_TIMESTAMP),
  ('plan_ultra',        'Ultra',        'Preliminar: sin límite de comunidades.', NULL, 6, true, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;
