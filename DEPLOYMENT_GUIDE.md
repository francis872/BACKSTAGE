# ðŸš€ BACKSTAGE Intelligence - GuÃ­a de Despliegue Completo

## ðŸ“‹ Estado Actual

```
âœ… FRONTEND (Vercel)
   - URL: https://backstage-intelligence.vercel.app
   - Stack: React + Vite
   - Status: âœ“ Operativo

â³ BACKEND (Por desplegar en Railway)
   - Stack: Express.js + PostgreSQL + PostGIS
   - Status: âš ï¸  Listo para desplegar, aÃºn NO en producciÃ³n
   - Lugar: backend/

ðŸ“¦ Base de Datos
   - PostgreSQL 15 + PostGIS
   - Status: âš ï¸  Necesita Railway o similar
```

## ðŸš€ Despliegue Paso a Paso

### Fase 1: Desplegar Backend + DB en Railway (â±ï¸  10 minutos)

**OpciÃ³n A: CLI de Railway (Recomendado)**

```bash
# 1. Instalar Railway CLI
npm install -g @railway/cli

# 2. Autenticar
railway login

# 3. Crear proyecto
railway init
# Selecciona: "Create new project"
# Nombre: backstage-intelligence

# 4. Agregar PostgreSQL
railway add -u
# Selecciona: PostgreSQL

# 5. Desplegar backend
cd backend
railway up

# 6. Obtener URL
railway env
# Copia el RAILWAY_PUBLIC_DOMAIN (ej: backstage-intelligence-prod.railway.app)
```

**OpciÃ³n B: GitHub Integration (AutomÃ¡tico)**

1. Ve a https://railway.app
2. Sign Up / Login
3. "New Project" â†’ "Deploy from GitHub"
4. Conecta `francis872/BACKSTAGE`
5. Railway automÃ¡ticamente:
   - Lee el `Dockerfile` del backend
   - Crea PostgreSQL
   - Despliega en Railway

### Fase 2: Inicializar Base de Datos

Una vez desplegado, ejecuta las migraciones:

```bash
# Si usaste CLI
cd backend
railway exec npm run db:init

# O manualmente
railway exec node init-railway.js
```

Esto:
- âœ“ Crea extensiÃ³n PostGIS
- âœ“ Ejecuta schema.sql
- âœ“ Corre migraciones
- âœ“ Siembra datos de ejemplo (ubicaciones, riesgos, zonas retail)

### Fase 3: Actualizar Frontend en Vercel

Una vez que el backend estÃ© en Railway:

```bash
# 1. Actualizar .env.production con URL de Railway
echo "BACKEND_URL=https://backstage-intelligence-prod.railway.app" > frontend/.env.production

# 2. Commit y push
git add frontend/.env.production
git commit -m "feat: point frontend to Railway backend"
git push

# 3. Vercel desplegarÃ¡ automÃ¡ticamente
```

## âœ… VerificaciÃ³n

### 1. Backend estÃ¡ activo
```bash
curl https://backstage-intelligence-prod.railway.app/health
# Respuesta esperada: {"status":"ok","service":"BACKSTAGE Intelligence Backend"}
```

### 2. Base de datos tiene datos
```bash
curl https://backstage-intelligence-prod.railway.app/locations
# Respuesta esperada: array con ubicaciones
```

### 3. Frontend conecta al backend
- Abre: https://backstage-intelligence.vercel.app
- Abre DevTools â†’ Network
- DeberÃ­a haber requests a: `https://backstage-intelligence-prod.railway.app/...`

## ðŸ“Š Arquitectura Final

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                           â”‚
â”‚  ðŸŒ Frontend (Vercel)                                     â”‚
â”‚  https://backstage-intelligence.vercel.app              â”‚
â”‚  - React + Vite SPA                                      â”‚
â”‚  - Proxy /api â†’ Backend                                  â”‚
â”‚                                                           â”‚
â”‚          â†“ API Calls                                      â”‚
â”‚                                                           â”‚
â”‚  ðŸš€ Backend (Railway)                                     â”‚
â”‚  https://backstage-intelligence-prod.railway.app         â”‚
â”‚  - Express.js REST API                                   â”‚
â”‚  - CORS enabled                                          â”‚
â”‚  - Routing: /locations, /scoring, /earthart, etc         â”‚
â”‚                                                           â”‚
â”‚          â†“ Queries                                        â”‚
â”‚                                                           â”‚
â”‚  ðŸ—„ï¸  PostgreSQL (Railway)                                 â”‚
â”‚  - PostGIS enabled                                       â”‚
â”‚  - Schema completo (retail, risk, real estate, earthart) â”‚
â”‚  - Datos de ejemplo (BogotÃ¡)                             â”‚
â”‚                                                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## ðŸ“‹ Endpoints Disponibles

### Health Check
- `GET /health` â†’ Status del backend

### Locations (Ubicaciones)
- `GET /locations` â†’ Todas las ubicaciones
- `GET /locations/nearby?lat=4.71&lng=-74.07&radius=2000` â†’ Cercanas

### Locations Analytics
- `GET /locations/analytics/top-by-risk` â†’ Top por riesgo
- `GET /locations/analytics/by-type` â†’ Agrupadas por tipo

### Scoring
- `POST /locations/:id/score` â†’ Evaluar ubicaciÃ³n

### Retail Intelligence
- `GET /retail-zones` â†’ Zonas comerciales
- `GET /retail-zones/:id/analytics` â†’ Analytics de zona

### Real Estate
- `GET /property-valuations` â†’ Valuaciones
- `GET /property-valuations/:id` â†’ Detalle

### EARTHART
- `GET /earthart/territorial-index` â†’ Ãndice territorial
- `GET /earthart/territorial-index/:id/gaps` â†’ Brechas
- `POST /earthart/territorial-index/:id/simulate` â†’ Simular infraestructura

## ðŸ”‘ Variables de Entorno

### Frontend (.env.production)
```
BACKEND_URL=https://backstage-intelligence-prod.railway.app
```

### Backend (Railway)
```
NODE_ENV=production
DATABASE_URL=postgresql://... (auto-generada por Railway)
PORT=3000 (auto-asignado por Railway)
CORS_ORIGIN=https://backstage-intelligence.vercel.app
```

## ðŸ’° Costos (Estimado)

| Servicio | Costo | Notas |
|----------|-------|-------|
| Railway Backend | $0/mes | Incluido en crÃ©dito gratis de $5 |
| PostgreSQL | $0/mes | Gratis hasta 500MB |
| Vercel Frontend | $0/mes | Hobby plan |
| **TOTAL** | **$0/mes** | Primer mes gratis |

*DespuÃ©s del primer mes: ~$10-15/mes (si crece BD)*

## ðŸ†˜ Troubleshooting

### "Cannot connect to database"
â†’ La BD aÃºn se estÃ¡ inicializando. Espera 2-3 minutos y reinicia:
```bash
railway restart
```

### "CORS Error en frontend"
â†’ Actualiza `CORS_ORIGIN` en Railway:
```bash
railway variables set CORS_ORIGIN=https://backstage-intelligence.vercel.app
```

### "Empty database"
â†’ Las migraciones no se ejecutaron. Ejecuta manualmente:
```bash
cd backend
railway exec npm run db:init
```

### "502 Bad Gateway"
â†’ El backend se estÃ¡ iniciando. Espera 1-2 minutos.

### "API timeout"
â†’ La BD estÃ¡ lenta. Verifica en Railway:
```bash
railway logs
```

## ðŸ“š DocumentaciÃ³n Adicional

- [Backend API](./backend/README.md)
- [Frontend Setup](./frontend/README.md)
- [Railway Deployment Details](./RAILWAY_DEPLOYMENT.md)

---

**Â¿Listo para desplegar? ðŸš€**

Sigue los pasos de **Fase 1**, luego **Fase 2**, luego **Fase 3**. 

Â¡En 15 minutos tendrÃ¡s la stack completa en producciÃ³n!

