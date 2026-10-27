# Despliegue de SOI

La base de datos de todos los módulos persistentes es MongoDB Atlas. Configura `MONGODB_URI`, `MONGODB_DB` o `MONGODB_SPATIAL_DB`, `SPATIAL_STORE=atlas`, `JWT_SECRET`, `NODE_ENV=production` y `CORS_ORIGIN` en el backend. La web utiliza `BACKEND_URL`.

Inicializa los índices con `npm run mongo:plan --prefix backend` y `npm run mongo:init --prefix backend` en el entorno autorizado. El build no modifica datos de Atlas.

Vercel debe desplegar el paquete generado por `node scripts/prepare-soi-deployment.js`, que incluye la API Node y la función científica Python. El RPC científico utiliza `SOI_SCIENCE_RPC_URL=self`, una clave privada `SOI_SCIENCE_RPC_SECRET` y `BSIE_REQUEST_WORKER=true`.

Genera la web con `node scripts/prepare-soi-web-deployment.js`. Ambos scripts informan la carpeta de staging. `node scripts/deploy-soi-cloud.js <carpeta> --cli <ruta-cli>` crea el despliegue para verificar antes de promover sus dominios.

Antes de publicar, comprueba autenticación, aislamiento por organización, persistencia en Atlas, motores científicos y `/health`: `primaryStore=mongodb`, `mongodb=healthy`, `spatialStore=atlas`.

Consulta los contratos y límites en [SOI sanitario](docs/SOI_SANITARY_API.md). Los archivos de entorno y las claves privadas están excluidos del paquete.

Dominios: https://backstage-web-seven.vercel.app y https://backstage-api.vercel.app. La evidencia del despliegue anterior está en `docs/evidence/soi-deployment.json`; los cambios locales requieren una nueva verificación y publicación.
