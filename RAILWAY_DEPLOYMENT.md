# Despliegue en Railway

> Fuente vigente: `.github/workflows/deploy-railway.yml`. Esta guía sustituye comandos manuales de inicialización heredados. Pull requests solo validan; la rama `main` despliega mediante el environment GitHub `production`.

## OpciÃ³n 1: CLI de Railway (Recomendado)

### 1. Instalar Railway CLI

```bash
# Windows (PowerShell)
iwr https://releases.railway.app/cli/installers/latest/windows/x64/railway.exe -OutFile railway.exe
.\railway.exe --version

# macOS/Linux
npm i -g @railway/cli
railway --version
```

### 2. Autenticar y Crear Proyecto

```bash
railway login
railway init

# Selecciona "Create new project"
# Nombre: "backstage-intelligence"
```

### 3. Agregar Base de Datos

```bash
railway add -u
# Selecciona "PostgreSQL"
# Acepta los valores por defecto

# Verifica que la DB estÃ¡ creada
railway status
```

### 4. Desplegar Backend

```bash
cd backend

# Establece variables de entorno
railway variables set NODE_ENV production
railway variables set CORS_ORIGIN https://backstage-intelligence.vercel.app

# Desplegar manualmente solo cuando no se use el workflow
railway up

# Verifica el despliegue
railway status
```

### 5. Obtener URL del Backend

```bash
railway env

# Busca: RAILWAY_PUBLIC_DOMAIN o similar
# SerÃ¡ algo como: backstage-intelligence-prod.railway.app
```

## OpciÃ³n 2: Usar GitHub (AutomÃ¡tico)

Railway puede leer directamente desde tu repo GitHub y desplegar automÃ¡ticamente.

### 1. Ir a https://railway.app

### 2. Sign Up / Login

### 3. "New Project" â†’ "Deploy from GitHub"

### 4. Conectar tu repo: `francis872/BACKSTAGE`

### 5. Seleccionar rama: `main`

### 6. Esperar despliegue automÃ¡tico

El workflow debe ser el responsable del despliegue. Railway debe tener PostgreSQL y las variables requeridas ya configuradas.

## Paso 5: Actualizar Frontend en Vercel

Una vez desplegado el backend en Railway:

```bash
cd frontend

# Actualizar .env.production
echo "VITE_API_URL=https://backstage-intelligence-prod.railway.app" > .env.production

# Commit y push
git add .
git commit -m "feat: update backend URL to Railway"
git push

# Vercel desplegarÃ¡ automÃ¡ticamente
```

## Variables de Entorno en Railway

| Variable | Valor | Notas |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | *Auto* | Railway la crea automÃ¡ticamente |
| `PORT` | Railway-provided | Railway lo asigna automÃ¡ticamente |
| `CORS_ORIGIN` | `https://backstage-intelligence.vercel.app` | URL de tu frontend en Vercel |
| `JWT_SECRET` | Aleatorio, 32+ caracteres | Obligatorio en producción |
| `SPATIAL_STORE` | `memory` | Atlas futuro requiere `MONGODB_URI` |

## Verificar que Todo Funciona

```bash
# 1. Backend estÃ¡ UP
curl https://backstage-intelligence-prod.railway.app/health

# 2. Frontend puede conectar a Backend
# Abre: https://backstage-intelligence.vercel.app
# Abre DevTools â†’ Network
# DeberÃ­a haber requests a: https://backstage-intelligence-prod.railway.app/locations

# 3. Base de datos tiene datos
curl https://backstage-intelligence-prod.railway.app/locations
```

## Precios en Railway

- **Base de Datos PostgreSQL**: Gratis los primeros 500MB, luego $0.35/GB/mes
- **Backend (Deploy)**: Gratis con $5/mes crÃ©dito
- **Total**: Gratis el primer mes (estÃ¡ dentro del crÃ©dito)

## Troubleshooting

### "Connection refused"
â†’ La DB aÃºn no estÃ¡ lista. Espera 2-3 minutos

### "CORS Error"
â†’ Actualiza `CORS_ORIGIN` en Railway con la URL correcta de Vercel

### "Cannot find module"
â†’ Verifica que `npm install` se ejecutÃ³. Railway lo hace automÃ¡ticamente, pero revisa logs:
```bash
railway logs
```

### "Database is empty"
Verifica que el job de migraciones del workflow terminó correctamente. Los datos demo no se cargan en producción.

---

**Â¿Necesitas ayuda? Lee `backend/README.md` para mÃ¡s detalles.**

