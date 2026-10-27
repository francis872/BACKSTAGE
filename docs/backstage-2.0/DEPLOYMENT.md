> Publicación vigente: [BACKSTAGE público](https://backstage-web-seven.vercel.app), 24/10/2026, 13:33 Bogotá. [Procedimiento, IDs, respaldo y evidencia](PRODUCTION_RELEASE.md). Usar `scripts/release-production.js` para conservar la pareja API/web y desactivar los endpoints retirados de Render; los helpers históricos no contienen todas esas opciones. Atlas sigue compartido con pruebas. Las notas inferiores describen etapas anteriores.

# Despliegue de BACKSTAGE

> Estado actual (24/10/2026): UI/UX, reglas y transporte corregido en staging protegido; integración, carga, reversión y postflight aprobados. [UI/UX](USABILITY_REPORT.md), [preparación y pendientes](READINESS_REPORT.md). Helpers de este incremento con `--readiness`; no repetir setup ni modificar los proyectos originales. Las referencias siguientes conservan su alcance histórico.

> Incremento vigente: reglas/GIS/optimización en Preview protegido. [Informe](PHASE_5_SPATIAL_REPORT.md). Los helpers del staging ya configurado admiten `--spatial`; evidencias `phase-5-spatial-*`, sin repetir setup ni cambiar proyectos originales de producción.

> Incremento vigente de finanzas/Monte Carlo: [informe validado](PHASE_5_ENGINES_REPORT.md). Para el staging ya configurado usar los helpers con `--engines`; no repetir `setup`. Evidencias separadas `phase-5-engines-*`; destino Preview y Atlas de pruebas. La comparación anterior y los pasos iniciales debajo se conservan como historial.

## Estado vigente: staging

El incremento actual de comparación reproducible ya está validado y publicado exclusivamente en staging: [Fase 5](PHASE_5_REPORT.md). Sus despliegues, manifiestos, prueba real y postflight usan evidencia `phase-5-*`; el informe inicial de staging conserva su evidencia histórica. Para repetir esos verificadores y despliegues se usa `--phase5` y el destino Preview del helper. No se requiere ejecutar inicialización de índices: el contrato nuevo es un campo adicional de las colecciones existentes.

El despliegue de staging aprobado posteriormente está completado y verificado: [informe](STAGING_REPORT.md). Web: https://backstage-staging-web.vercel.app; API: https://backstage-staging-api.vercel.app. Son proyectos propios, protegidos, con destino Preview y Atlas de pruebas. Los proyectos originales de producción conservan sus versiones, dominios y configuración.

Las instrucciones y gates de fases que siguen documentan su estado en ese momento; el informe de staging prevalece para el estado actual. Los helpers históricos con `--prod` no son el procedimiento de staging.

Reproducción de los pasos del incremento (cada despliegue es una acción explícita):

```text
node scripts/staging-vercel.js setup
node scripts/staging-vercel.js deploy-api --cli RUTA_A_VERCEL_CLI
node scripts/staging-vercel.js deploy-web --cli RUTA_A_VERCEL_CLI
node scripts/verify-prepared-backstage.js --staging
node backend/scripts/verify-staging.js --test-environment --apply
node scripts/staging-vercel.js alias-staging
node backend/scripts/inspect-staging.js
node scripts/staging-vercel.js verify-production
```

`setup` usa la conexión que coincide con el preflight de Atlas; configura únicamente los proyectos nuevos del estado privado y variables Preview. Los proyectos existentes ajenos a ese estado se rechazan. El primer despliegue de un proyecto nuevo puede requerir repetir el paso para obtener un destino Preview: el script detecta el destino inicial automático de Vercel y no lo valida como Preview. No hay que volver a ejecutar setup para una lectura de salud. No publicar el archivo privado de estado.

## Historial: release preparado en Fase 1

La Fase 1 modifica código local y prepara artefactos. No ejecuta Vercel, push, inicialización de índices ni cambios de variables remotas. `.github/workflows/ci-vercel.yml` contiene validación y carga de artefactos; se eliminó su publicación automática por push.

Preparación reproducible desde la raíz:

```text
node scripts/verify-soi-release.js
npm run build --prefix frontend
node frontend/scripts/soi-browser-smoke.mjs
node scripts/prepare-soi-deployment.js --unlinked
node scripts/prepare-soi-web-deployment.js --unlinked
node scripts/verify-prepared-backstage.js
```

`--unlinked` evita copiar los metadatos locales del proyecto Vercel. Los scripts conservan nombres históricos por compatibilidad. Sus salidas en `.vercel/soi-api-*` y `.vercel/soi-web-*` contienen fuentes y manifiestos SHA-256; excluyen `.env`, dependencias instaladas y cachés. Los artefactos API preservan Node 24, Python 3.12, función científica privada, BSIE, OR-Tools y el RPC existente. Ambos paquetes incluyen lock de dependencias. El frontend incorpora `shared` junto a su fuente para resolver los imports.

El verificador comprueba locks, hashes, archivos y configuración; el paquete API comprueba carga de módulos. La compilación y las suites se han ejecutado localmente. No se afirma que se haya construido el artefacto en Vercel o ejecutado el workflow en GitHub.

Antes de una publicación se debe aprobar una versión concreta, decidir el entorno, verificar configuración/rutas científicas, revisar la inicialización de índices incluida en el build existente y comprobar staging/rollback. La autorización de Fase 1 no concede ese permiso. No deben ejecutarse los helpers históricos de deploy para validar una preparación.

Vercel serverless no ejecuta el supervisor y WebSocket del servidor nativo. La UI conserva sondeo. Durabilidad de eventos y workers pertenece a una fase posterior; no se promete tiempo real por incluir archivos de WebSocket en el paquete.


## Gate adicional tras Fase 4

Los paquetes de Fase 4 se preparan sin vinculación remota; no implican despliegue. Antes de publicar se requiere revisar el delta `identity_invitations` y sus tres índices en Atlas de pruebas, confirmar transacciones/reintentos, aceptación única bajo concurrencia, revocación, auditoría y respaldo restaurable. No asumir que el marcador de esquema existente versión 2 acredita por sí solo esos índices nuevos. Ningún script de inicialización con aplicación se ejecutó durante esta fase.

El canal WebSocket nativo requiere un proceso/hosting que soporte conexiones persistentes. Su comprobación local no prueba soporte del destino productivo; el frontend conserva sondeo. Las invitaciones no envían mensajes: el administrador comparte el enlace manualmente.


## Validación de Atlas realizada después de Fase 4

El gate de datos se ejecutó con autorización posterior: [informe](ATLAS_VALIDATION_REPORT.md). La colección y los tres índices de invitaciones ya están preparados en la conexión de pruebas; no hay que volver a inicializar todo el esquema. Persistencia, concurrencia, permisos, cadena y restauración lógica de datos del ensayo pasaron. Esto no acredita por sí solo un respaldo completo ni el funcionamiento del hosting de staging/producción. No se publicó una versión en este incremento.
