# API BACKSTAGE con MongoDB Atlas

SOI es el módulo sanitario; activos, GIS, identidad y comparación también tienen contratos generales. Consulta [Core API](../docs/backstage-2.0/CORE_API.md).

Node.js 24 y MongoDB Atlas con transacciones. Configura `.env` desde `.env.example` con `MONGODB_URI`, `MONGODB_DB` o `MONGODB_SPATIAL_DB`, `SPATIAL_STORE=atlas` y `JWT_SECRET`.

- `npm run mongo:plan`: revisar colecciones e índices.
- `npm run mongo:init`: aplicar índices sin borrar datos ni crear cuentas.
- `npm start`: iniciar la API.
- `npm test`: verificar contratos y algoritmos con adaptadores aislados.

Las cuentas se crean mediante `/auth/register`; las membresías se consultan en Atlas. Todos los servicios persistentes usan el controlador nativo `mongodb`. Los motores Python se describen en `../docs/SOI_SANITARY_API.md`.

Para Vercel utiliza el paquete generado por `../scripts/prepare-soi-deployment.js`; consulta `../DEPLOYMENT_GUIDE.md`.
