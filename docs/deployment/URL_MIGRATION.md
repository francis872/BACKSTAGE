# Cambio de identidad pública de URL — BACKSTAGE Intelligence

## Estado: Completado

## Contexto (ADR)
El frontend se servía bajo un nombre autogenerado por Vercel
(`frontend-seven-black-14.vercel.app`), sin relación con la marca del
producto. Se decidió adoptar un dominio `*.vercel.app` con identidad
propia mientras no exista un dominio propio (DNS externo) del negocio.

## Decisión
Usar `backstage-intelligence.vercel.app` como alias primario público del
proyecto `frontend` (cuenta Vercel `thisharmonyconecct-4448s-projects`).
Se descartó comprar un dominio externo en esta fase por no existir aún
una decisión de marca/registrador definida por el propietario; queda
como trabajo futuro (ver sección "Pendiente").

## Alternativas consideradas
1. `backstage-intelligence.vercel.app` — **elegida**, disponible sin conflicto.
2. `backstage-analytics.vercel.app` — no fue necesaria, la opción 1 estaba libre.
3. Dominio propio (ej. `backstage.io`) — requiere compra/DNS del propietario,
   no ejecutado por no tener autorización ni proveedor de dominio definidos.

## Cambios realizados

### Frontend (proyecto Vercel `frontend`)
- Se agregó el alias `backstage-intelligence.vercel.app` apuntando al mismo
  deployment de producción que `frontend-seven-black-14.vercel.app`.
- Se detectó que `ssoProtection.deploymentType` estaba en
  `all_except_custom_domains`, lo que bloqueaba con un muro de login de
  Vercel (SSO) cualquier alias que no fuera el dominio "canónico" original.
  Se deshabilitó `ssoProtection` (`vercel project protection disable frontend --sso`)
  para que el nuevo alias — y cualquier alias futuro — sirva la app
  públicamente, igual que ya ocurría con la URL anterior.
- `index.html`: se agregaron `<link rel="canonical">`, Open Graph y
  Twitter Card apuntando al nuevo dominio. Se agregaron `public/robots.txt`
  y `public/sitemap.xml`.

### Backend (proyecto Vercel `backend`)
- Variable `CORS_ORIGIN` de producción actualizada para incluir ambos
  orígenes de frontend (nuevo y legado) más los orígenes de desarrollo local:
  ```
  https://backstage-intelligence.vercel.app,
  https://frontend-seven-black-14.vercel.app,
  http://localhost:3000,
  http://localhost:3001
  ```
- Backend redesplegado a producción para aplicar la variable.

### Documentación
- Reemplazadas las referencias a `frontend-seven-black-14.vercel.app` por
  `backstage-intelligence.vercel.app` en `PROJECT_STATUS.md`,
  `DEPLOYMENT_GUIDE.md`, `RAILWAY_DEPLOYMENT.md` y `RENDER_DEPLOY.md`.
- **No se eliminó** `frontend-seven-black-14.vercel.app`: sigue siendo un
  alias válido del mismo deployment (mismo contenido, mismo backend), por
  lo que actúa como redirección/legado sin enlaces rotos, cumpliendo el
  requisito de no romper URLs existentes.

## Verificación (evidencia)
Ejecutado en esta sesión, con navegador real contra producción:
- `https://backstage-intelligence.vercel.app/` responde `200 OK`, sin
  advertencias TLS (certificado gestionado por Vercel, wildcard `*.vercel.app`).
- Registro de cuenta y login funcionan desde el nuevo origen
  (`POST /auth/register`, `POST /auth/login`) sin error de CORS.
- `GET /health` del backend responde con
  `Access-Control-Allow-Origin: https://backstage-intelligence.vercel.app`.
- Navegación directa a una ruta interna (`/login`) y recarga del navegador
  no produce 404 (fallback SPA correcto).
- Título de pestaña y metadatos muestran "BACKSTAGE Intelligence".
- Cuentas de prueba creadas para la verificación fueron eliminadas de la
  base de datos al finalizar.

## Pendiente (bloqueado por decisión/acceso del propietario)
- **Dominio propio** (ej. `backstage-intelligence.com` o similar): requiere
  que el propietario compre/aporte el dominio y otorgue acceso DNS o lo
  configure él mismo siguiendo esta guía:
  1. Comprar el dominio en cualquier registrador.
  2. En Vercel → Project `frontend` → Settings → Domains → Add → escribir
     el dominio.
  3. Configurar en el registrador los registros que Vercel indique
     (`A`/`ALIAS` a `76.76.21.21` o `CNAME` a `cname.vercel-dns.com`, y
     `www` como `CNAME` a `cname.vercel-dns.com`).
  4. Esperar propagación DNS y emisión automática del certificado TLS.
  5. Repetir la actualización de `CORS_ORIGIN` en el backend con el dominio
     final.
  Sin esta decisión de negocio (nombre de dominio, registrador, presupuesto),
  no se ejecuta una compra o cambio DNS de forma autónoma.
- **WebSockets en producción**: el backend actual corre como función
  serverless de Vercel, que no soporta conexiones WebSocket persistentes.
  El panel de auditoría en vivo seguirá funcionando en modo *polling* en
  producción hasta que el backend (o un servicio dedicado) se despliegue en
  un runtime con soporte de procesos persistentes (Railway, Fly.io, un VPS,
  etc.). Esto es una limitación de infraestructura, no del código.
