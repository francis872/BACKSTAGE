# BACKSTAGE 3.1.0 — Estado

## Runtime objetivo

- Node.js 24
- PostgreSQL 17 nativo/administrado mediante `DATABASE_URL`
- MongoDB Atlas mediante `MONGODB_URI`, `SPATIAL_STORE=atlas`
- Vercel para Preview y Production
- Sin Docker, PostGIS ni Railway en el runtime

## Gate de lanzamiento

No declarar release listo hasta que PostgreSQL y Atlas respondan healthy desde Vercel, la persistencia sobreviva reinicios, y pasen autenticación, aislamiento organizacional, análisis territorial, comparación multiciudad y E2E de producción.

CI valida los motores y usa una instancia efímera PostgreSQL 17 para pruebas de integración. Esto no implica dependencia de Docker para el runtime local o productivo.

Consulta `README.md`, `QUICK_DEPLOY.md` y `DEPLOYMENT_GUIDE.md` para instrucciones operativas vigentes.
