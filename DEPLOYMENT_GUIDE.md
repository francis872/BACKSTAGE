# Despliegue BACKSTAGE 3.1.0

## Arquitectura

Producción se sirve desde Vercel. PostgreSQL 17 es la fuente operacional y MongoDB Atlas es el almacén espacial. Docker, PostGIS y Railway no forman parte del runtime.

## Desarrollo nativo

Requisitos: Node.js 24, PostgreSQL 17 nativo y MongoDB Atlas.

1. Copia `.env.example` a `backend/.env` y configura `DATABASE_URL`, `MONGODB_URI`, `JWT_SECRET`, `SPATIAL_STORE=atlas` y `MONGODB_SPATIAL_DB=backstage_spatial`.
2. Ejecuta `npm run setup` para instalar dependencias, comprobar/provisionar la base objetivo y aplicar migraciones. El comando no borra bases ni crea datos demo.
3. Ejecuta `npm run dev`. API: `http://localhost:4000`; frontend: `http://localhost:5173`.
4. Confirma `/api/health` con PostgreSQL healthy, MongoDB healthy y `spatialStore=atlas`.

El setup se detiene si `backend/.env` no existe o si no se puede conectar a la base indicada. No contiene credenciales por defecto.

## Vercel

Configura en los entornos Preview y Production los nombres `DATABASE_URL`, `MONGODB_URI`, `MONGODB_SPATIAL_DB`, `SPATIAL_STORE`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` y `CORS_ORIGIN`. No guardes sus valores en el repositorio.

1. Ejecuta `vercel build`.
2. Publica Preview con `vercel deploy --target=preview --yes`.
3. Comprueba rutas SPA, assets, `/api/health`, autenticación y flujos de producto con datos persistentes.
4. Promueve a Production solo si PostgreSQL y Atlas están healthy y pasan los E2E requeridos.

`npm run db:init` es manual y no debe ejecutarse en producción; puede cargar datos de ejemplo fuera de producción. El workflow de GitHub usa PostgreSQL efímero solo para CI; la aplicación local y Vercel no dependen de Docker.
