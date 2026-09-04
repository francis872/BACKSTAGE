# ðŸš€ BACKSTAGE - Despliegue en Render.com

## Pasos para desplegar en Render (GRATIS y sin restricciones):

### 1. **Crear cuenta en Render**
   - Ve a: https://render.com
   - Sign up con GitHub (recomendado)

### 2. **Conectar repositorio**
   - Dashboard â†’ New â†’ Web Service
   - Conectar repositorio: `BACKSTAGE`
   - Branch: `main`

### 3. **Configurar Backend**
   - **Name:** `backstage-backend`
   - **Runtime:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && node index.js`
   - **Region:** US East (o tu preferencia)
   - **Plan:** Free (unlimited)

### 4. **Agregar PostgreSQL**
   - Dashboard â†’ New â†’ PostgreSQL
   - **Name:** `backstage-db`
   - **Region:** US East (misma que backend)
   - **Plan:** Free (10GB storage)

### 5. **Conectar Base de Datos al Backend**
   - Copiar `External Database URL` de PostgreSQL
   - Ir a Backend Service â†’ Environment
   - Agregar: `DATABASE_URL` = (URL de PostgreSQL)
   - Deploy automÃ¡tico se dispara

### 6. **Verificar Deployments**
   ```bash
   Backend: https://backstage-backend-xxxx.onrender.com
   ```

### 7. **Actualizar Frontend**
   - En `frontend/.env.production`:
   ```
   VITE_API_URL=https://backstage-backend-xxxx.onrender.com
   ```
   - Push a GitHub â†’ Vercel redeploy automÃ¡tico

---

## URLs Finales:
- **Frontend:** https://backstage-intelligence.vercel.app
- **Backend:** https://backstage-backend-xxxx.onrender.com
- **Database:** Managed PostgreSQL en Render

---

## Tiempo Total: ~5 minutos

Â¡Plataforma completamente operativa sin pagar nada! ðŸŽ‰

