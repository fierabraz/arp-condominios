# ERP Condominios

Sistema web para que administradoras de edificios y condominios gestionen sus comunidades y cobren gastos comunes. Cada administradora tiene su propio espacio con sus datos separados, así que un mismo sistema sirve a muchos clientes.

## Qué hace hoy

- Inicio de sesión con cuatro roles: plataforma, administrador, comité (solo lectura) y residente.
- Alta de administradoras (clientes) desde la cuenta de plataforma.
- Condominios con su fondo de reserva, interés por mora y día de vencimiento.
- Unidades con su alícuota; el sistema avisa si las alícuotas no suman 100 %.
- Personas (propietarios y residentes) vinculadas a sus unidades.
- Cuentas de usuario para administradores, comité y residentes.
- Períodos mensuales: se registran gastos comunes y cargos individuales (multas, consumos) y al cerrar el período se emite un aviso de cobro por unidad.
- Cálculo del aviso: gasto común × alícuota + fondo de reserva + cargos individuales + interés por mora sobre la deuda vencida. Los montos se reparten sin perder ni un peso por redondeo.
- Pagos que se aplican a la deuda más antigua; lo que sobra queda como saldo a favor y se usa en el siguiente cobro. Un pago mal ingresado se puede anular.
- Estado de cuenta por unidad, listado de morosidad y portal del residente con sus avisos y pagos.
- Aviso de cobro en PDF por unidad, con el detalle del mes, la deuda anterior y los gastos del condominio.
- Rendición mensual en PDF por condominio: gastos por categoría, detalle con proveedores, fondo de reserva, recaudación y avisos impagos. La ven el administrador, el comité y los residentes del condominio.
- Envío de los avisos de cobro por correo, con el PDF adjunto, a los propietarios y residentes que tengan correo registrado. Cada envío queda registrado.

### Correo

Para que los correos salgan de verdad, completa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `SMTP_FROM` en `.env` con los datos de tu proveedor (Gmail, Brevo, Amazon SES, etc.). Mientras no estén, el sistema funciona en modo de prueba: no envía nada y guarda una copia de cada correo en la carpeta `correos-simulados/`.

## Cómo ejecutarlo en tu computador

Necesitas instalar dos programas una sola vez:

1. [Node.js](https://nodejs.org) versión 20 o superior.
2. [PostgreSQL](https://www.postgresql.org/download/) versión 14 o superior. Durante la instalación anota la contraseña del usuario `postgres`.

Luego, en una terminal dentro de esta carpeta:

```bash
# 1. Crear la base de datos (te pedirá la contraseña de postgres)
createdb -U postgres erp_condominios

# 2. Copiar la configuración y editar DATABASE_URL con tu usuario y contraseña
cp .env.example .env

# 3. Instalar dependencias, crear las tablas y cargar datos de ejemplo
npm install
npm run db:deploy
npm run db:seed

# 4. Iniciar el sistema
npm run dev
```

Abre <http://localhost:3000> en el navegador.

### Cuentas de ejemplo

Todas usan la contraseña `demo1234`.

| Correo | Rol | Qué ve |
| --- | --- | --- |
| plataforma@demo.cl | Plataforma | Lista de administradoras y alta de nuevas |
| admin@demo.cl | Administrador | Todo lo de "Administradora Demo" |
| comite@demo.cl | Comité | El Edificio Los Aromos, sin poder editar |
| maria@demo.cl | Residente | Sus unidades |

## Tecnología

- [Next.js](https://nextjs.org) 16 con TypeScript y Tailwind CSS.
- PostgreSQL con [Prisma](https://www.prisma.io) 7. El modelo está en `prisma/schema.prisma`.
- Sesiones con cookie firmada (`jose`) y contraseñas con `bcryptjs`.

Toda consulta filtra por `administradoraId` del usuario conectado (ver `src/lib/auth.ts`), que es lo que mantiene separados los datos de cada cliente.

## Comandos útiles

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Iniciar en modo desarrollo |
| `npm run build` y `npm start` | Compilar y ejecutar en modo producción |
| `npm run db:migrate` | Crear una migración tras cambiar el esquema |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:seed` | Cargar datos de ejemplo (incluye septiembre cerrado con morosos y octubre abierto) |
| `npm test` | Pruebas del cálculo de cobro |
| `npm run lint` y `npm run typecheck` | Revisar el código |
