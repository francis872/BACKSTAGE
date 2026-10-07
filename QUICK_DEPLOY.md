# Inicio rápido

BACKSTAGE usa PostgreSQL 17 nativo y MongoDB Atlas. No requiere Docker.

## Local

1. Instala Node.js 24 y PostgreSQL 17; prepara MongoDB Atlas.
2. Copia `.env.example` a `backend/.env` y completa las credenciales localmente.
3. Ejecuta `npm run setup`.
4. Ejecuta `npm run dev`.

Frontend: `http://localhost:5173`
API: `http://localhost:4000`

## Vercel

Configura `DATABASE_URL`, `MONGODB_URI`, `MONGODB_SPATIAL_DB=backstage_spatial`, `SPATIAL_STORE=atlas` y las variables JWT en Preview y Production.

```text
vercel build
vercel deploy --target=preview --yes
```

Revisa `/api/health` y los E2E de Preview. No promociones si PostgreSQL o Atlas no están healthy.
