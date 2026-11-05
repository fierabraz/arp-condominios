# Instrucciones para Claude en Convive

@AGENTS.md

Convive es una plataforma para administrar comunidades y condominios en Chile.
Óscar (GitHub: fierabraz) hace el desarrollo técnico con Claude. Mauricio define lo
funcional, valida y mantiene el organigrama y la matriz maestra con ChatGPT. Mauricio no
tiene acceso al repositorio: recibe la información a través de Óscar.

Óscar habla español y es principiante en GitHub: explica los pasos uno a uno.

## Informe de cambios para Mauricio (obligatorio)

Cada vez que termines con Óscar una implementación, corrección, modificación de interfaz,
cambio funcional o cambio técnico relevante, entrega a Óscar un informe breve para
Mauricio. No es un diagnóstico completo: debe entenderse sin leer el código.

**Cuándo:** al abrir o actualizar un PR con cambios de código, interfaz, reglas o
configuración, y al cerrar un análisis que cambie códigos de la matriz. Uno por entrega
funcional o conjunto coherente de cambios, no por cada commit. No hace falta para
correcciones de texto o pruebas internas sin efecto para los usuarios.

**Sin duplicados:** identifícalo por requerimiento + número de PR. Pega el informe en la
descripción del PR (sección "Informe para Mauricio"); antes de escribir uno, revisa si el PR
ya lo tiene. Si el PR cambia, entrega un informe "actualizado" que diga que reemplaza al
anterior.

**Formato (exacto):**

```
CONVIVE — INFORME DE CAMBIOS

Fecha:
Requerimiento:
Módulo afectado:
Rama / commit / PR:

1. Qué se hizo
2. Qué cambió para los usuarios
3. Estado anterior y nuevo
4. Qué se comprobó
5. Qué quedó pendiente
6. Impacto en la planificación   (códigos de requerimientos, módulos y tareas: COM-001, 03.07.01, T-68...)
7. Observaciones para Mauricio

ÓSCAR: ENVÍALO A MAURICIO.
```

La frase final va siempre, destacada y tal cual. No la reemplaces por otra.

**Condiciones:**

- No incluyas credenciales, contraseñas ni datos personales de residentes.
- No declares como verificadas pruebas que no ejecutaste.
- No confundas código implementado con funcionalidad aprobada.
- Di expresamente si los cambios todavía no están publicados (PR sin fusionar).
- Diferencia trabajo terminado de trabajo pendiente de revisión.
- No digas que el informe se envía solo: Claude lo entrega a Óscar y Óscar lo reenvía.
- Usa los códigos existentes del proyecto (áreas 01-07, módulos AA.MM, tareas T-nn,
  decisiones D-XXX-nn, requerimientos como COM-001); no los renumeres.
