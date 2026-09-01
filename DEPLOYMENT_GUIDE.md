# 🚀 BACKSTAGE Intelligence - Guía de Despliegue Completo

## 📋 Estado Actual

```
✅ FRONTEND (Vercel)
   - URL: https://frontend-seven-black-14.vercel.app
   - Stack: React + Vite
   - Status: ✓ Operativo

⏳ BACKEND (Por desplegar en Railway)
   - Stack: Express.js + PostgreSQL + PostGIS
   - Status: ⚠️  Listo para desplegar, aún NO en producción
   - Lugar: backend/

📦 Base de Datos
   - PostgreSQL 15 + PostGIS
   - Status: ⚠️  Necesita Railway o similar
```

## 🚀 Despliegue Paso a Paso

### Fase 1: Desplegar Backend + DB en Railway (⏱️  10 minutos)

**Opción A: CLI de Railway (Recomendado)**

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

**Opción B: GitHub Integration (Automático)**

1. Ve a https://railway.app
2. Sign Up / Login
3. "New Project" → "Deploy from GitHub"
4. Conecta `francis872/BACKSTAGE`
5. Railway automáticamente:
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
- ✓ Crea extensión PostGIS
- ✓ Ejecuta schema.sql
- ✓ Corre migraciones
- ✓ Siembra datos de ejemplo (ubicaciones, riesgos, zonas retail)

### Fase 3: Actualizar Frontend en Vercel

Una vez que el backend esté en Railway:

```bash
# 1. Actualizar .env.production con URL de Railway
echo "BACKEND_URL=https://backstage-intelligence-prod.railway.app" > frontend/.env.production

# 2. Commit y push
git add frontend/.env.production
git commit -m "feat: point frontend to Railway backend"
git push

# 3. Vercel desplegará automáticamente
```

## ✅ Verificación

### 1. Backend está activo
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
- Abre: https://frontend-seven-black-14.vercel.app
- Abre DevTools → Network
- Debería haber requests a: `https://backstage-intelligence-prod.railway.app/...`

## 📊 Arquitectura Final

```
┌─────────────────────────────────────────────────────────┐
│                                                           │
│  🌐 Frontend (Vercel)                                     │
│  https://frontend-seven-black-14.vercel.app              │
│  - React + Vite SPA                                      │
│  - Proxy /api → Backend                                  │
│                                                           │
│          ↓ API Calls                                      │
│                                                           │
│  🚀 Backend (Railway)                                     │
│  https://backstage-intelligence-prod.railway.app         │
│  - Express.js REST API                                   │
│  - CORS enabled                                          │
│  - Routing: /locations, /scoring, /earthart, etc         │
│                                                           │
│          ↓ Queries                                        │
│                                                           │
│  🗄️  PostgreSQL (Railway)                                 │
│  - PostGIS enabled                                       │
│  - Schema completo (retail, risk, real estate, earthart) │
│  - Datos de ejemplo (Bogotá)                             │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

## 📋 Endpoints Disponibles

### Health Check
- `GET /health` → Status del backend

### Locations (Ubicaciones)
- `GET /locations` → Todas las ubicaciones
- `GET /locations/nearby?lat=4.71&lng=-74.07&radius=2000` → Cercanas

### Locations Analytics
- `GET /locations/analytics/top-by-risk` → Top por riesgo
- `GET /locations/analytics/by-type` → Agrupadas por tipo

### Scoring
- `POST /locations/:id/score` → Evaluar ubicación

### Retail Intelligence
- `GET /retail-zones` → Zonas comerciales
- `GET /retail-zones/:id/analytics` → Analytics de zona

### Real Estate
- `GET /property-valuations` → Valuaciones
- `GET /property-valuations/:id` → Detalle

### EARTHART
- `GET /earthart/territorial-index` → Índice territorial
- `GET /earthart/territorial-index/:id/gaps` → Brechas
- `POST /earthart/territorial-index/:id/simulate` → Simular infraestructura

## 🔑 Variables de Entorno

### Frontend (.env.production)
```
BACKEND_URL=https://backstage-intelligence-prod.railway.app
```

### Backend (Railway)
```
NODE_ENV=production
DATABASE_URL=postgresql://... (auto-generada por Railway)
PORT=3000 (auto-asignado por Railway)
CORS_ORIGIN=https://frontend-seven-black-14.vercel.app
```

## 💰 Costos (Estimado)

| Servicio | Costo | Notas |
|----------|-------|-------|
| Railway Backend | $0/mes | Incluido en crédito gratis de $5 |
| PostgreSQL | $0/mes | Gratis hasta 500MB |
| Vercel Frontend | $0/mes | Hobby plan |
| **TOTAL** | **$0/mes** | Primer mes gratis |

*Después del primer mes: ~$10-15/mes (si crece BD)*

## 🆘 Troubleshooting

### "Cannot connect to database"
→ La BD aún se está inicializando. Espera 2-3 minutos y reinicia:
```bash
railway restart
```

### "CORS Error en frontend"
→ Actualiza `CORS_ORIGIN` en Railway:
```bash
railway variables set CORS_ORIGIN=https://frontend-seven-black-14.vercel.app
```

### "Empty database"
→ Las migraciones no se ejecutaron. Ejecuta manualmente:
```bash
cd backend
railway exec npm run db:init
```

### "502 Bad Gateway"
→ El backend se está iniciando. Espera 1-2 minutos.

### "API timeout"
→ La BD está lenta. Verifica en Railway:
```bash
railway logs
```

## 📚 Documentación Adicional

- [Backend API](./backend/README.md)
- [Frontend Setup](./frontend/README.md)
- [Railway Deployment Details](./RAILWAY_DEPLOYMENT.md)

---

**¿Listo para desplegar? 🚀**

Sigue los pasos de **Fase 1**, luego **Fase 2**, luego **Fase 3**. 

¡En 15 minutos tendrás la stack completa en producción!
