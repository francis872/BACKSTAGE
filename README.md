# BACKSTAGE Intelligence

Plataforma de Location Intelligence para convertir datos dispersos en recomendaciones de decisión, no solo en mapas.

## Visión

BACKSTAGE responde preguntas de negocio como:

- ¿Cuál sucursal debería visitar un cliente?
- ¿Dónde abrir la siguiente tienda?
- ¿Qué zona está saturada?
- ¿Qué restaurante tiene menor tiempo de espera?
- ¿Dónde conviene invertir?
- ¿Qué ubicación generará mayor retorno?

## Módulos principales

- `BACKSTAGE Geo`: análisis geoespacial y territorial.
- `BACKSTAGE AI`: modelos predictivos, optimización y recomendaciones.
- `BACKSTAGE Risk`: evaluación de riesgos climáticos, financieros y territoriales.
- `BACKSTAGE Urban`: planeación urbana, catastro, avalúos y desarrollo inmobiliario.
- `BACKSTAGE Insights`: paneles ejecutivos, reportes e indicadores.
- `EarthArt`: gemelo digital territorial — índice territorial por dimensión, detector de brechas y motor predictivo de "qué pasaría si".

## Estructura del proyecto

- `backend/`: API y servicios de datos.
- `frontend/`: interfaz de usuario y experiencia de recomendaciones.
- `docs/`: visión, arquitectura y casos de uso.
- `data/`: modelos de datos y ejemplos de integración.

## Primeros pasos

1. Navegar a `backend/` y ejecutar `npm install`.
2. Navegar a `frontend/` y ejecutar `npm install`.
3. Iniciar backend con `npm start` desde `backend/`.
4. Iniciar frontend con `npm run dev` desde `frontend/`.

## Ejecución con Docker Compose

1. Construir y levantar servicios:
   - `docker compose up --build`
2. Backend disponible en `http://localhost:4000`.
3. Frontend disponible en `http://localhost:3000`.
4. La base de datos Postgres se ejecuta con PostGIS.

## Ejecución local rápida (frontend + API integrada)

El frontend usa rutas relativas `/api` por defecto.

- En local, `vite` proxy a `http://localhost:4000` para seguir usando el backend Express con Postgres.
- En Vercel, la API serverless integrada (`frontend/api/index.js`) responde los endpoints principales para operar el MVP sin configurar base de datos.

Si necesitas cambiar el backend local:

- `VITE_LOCAL_API_TARGET=http://localhost:4000`

## Carga de datos y migraciones

Desde `backend/`:

- `npm run migrate:up` — ejecutar migraciones.
- `npm run db:init` — cargar esquema y datos de ejemplo.

## Propuesta de valor

BACKSTAGE no compite con Google Maps en navegación. Usa datos de mapas junto con ERP, CRM, censos, POS y más para entregar decisiones optimizadas:

- ¿Qué decisión me conviene tomar?
- ¿Qué ubicación ofrece mayor retorno?
- ¿Dónde es más seguro invertir?

## Publicación en Git y Vercel

### 1) Inicializar repositorio Git local

```bash
git init
git add .
git commit -m "feat: BACKSTAGE app operativa con API integrada para Vercel"
```

### 2) Crear repositorio remoto y subir

```bash
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

### 3) Desplegar en Vercel

Desde la raíz del proyecto:

```bash
vercel --cwd frontend
```

Para producción:

```bash
vercel --cwd frontend --prod
```

Con esto, el frontend y la API `/api/*` quedan desplegados en el mismo dominio de Vercel.
