-- Día de pago propio de cada unidad. Solo agrega una columna opcional: las unidades
-- existentes quedan en null y siguen usando el día de vencimiento de la propiedad.
ALTER TABLE "Unidad" ADD COLUMN "diaPago" INTEGER;
