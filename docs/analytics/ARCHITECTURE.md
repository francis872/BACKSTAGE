# BACKSTAGE Analytics Core — Arquitectura

## Estado: Fase 1 implementada (multicriterio, financiero, riesgo). RBAC granular, worker Python asíncrono, MLOps y BI geoespacial quedan en `docs/backlog/PHASE_2_BACKLOG.md` como pendientes explícitos.

## Objetivo
Que cada número que BACKSTAGE muestra en pantalla provenga de un algoritmo
versionado, ejecutado de forma reproducible y auditable — no de una
constante escrita a mano ni de datos sembrados como respuesta.

## Flujo de una ejecución analítica

```
React (página)
  -> apiRequest('/analytics/<categoria>', { method, params })
Route (backend/routes/analytics.routes.js)
  -> authenticate + requireOrganizationContext + authorizeRoles
Controller (backend/controllers/analytics.controller.js)
  -> traduce HTTP a { algorithmName, params, context }
Service (backend/services/analytics.service.js)
  -> valida tamaño de payload
  -> crea fila en analytics_jobs (status=running)
  -> ejecuta el algoritmo (backend/infrastructure/analytics/algorithmRegistry.js)
  -> guarda resultado o error, marca succeeded/failed, calcula duración
Domain (backend/domain/analytics/*.js)
  -> funciones puras, deterministas, con pruebas doradas (backend/domain/analytics/__tests__)
PostgreSQL
  -> tabla analytics_jobs: organización, usuario, algoritmo, versión,
     parámetros, resultado, error, duración, timestamps
```

## Por qué no hay un worker Python separado (todavía)

El documento de referencia pide un worker Python asíncrono con cola
`queued/running/succeeded/failed/cancelled`. Esta fase implementa **el
mismo contrato de estados y trazabilidad** (tabla `analytics_jobs`), pero
la ejecución ocurre de forma síncrona dentro del proceso Node, por una
razón de infraestructura real y verificada en esta sesión: el backend
está desplegado como función serverless de Vercel (`backend/api/index.js`),
que no soporta procesos de larga duración ni un worker persistente.

Los algoritmos actuales (TOPSIS, AHP, VPN/TIR, Monte Carlo con hasta
200.000 iteraciones) se ejecutan en milisegundos a segundos, dentro del
límite de tiempo de una función serverless, por lo que el registro
síncrono con estados es funcionalmente equivalente a una cola para el
volumen actual. Si se introducen algoritmos de mayor costo (p. ej.
entrenamiento de modelos), este es el punto de extensión: el `service`
ya aísla "crear job -> ejecutar -> completar/fallar" del resto del
sistema, por lo que reemplazar la ejecución síncrona por un encolado
real (ej. una cola gestionada + un worker en un runtime con procesos
persistentes) no requiere cambiar los controllers ni el frontend.

## Capas y límites de responsabilidad

| Capa | Responsabilidad | Lo que NO hace |
|---|---|---|
| `domain/analytics/*.js` | Algoritmos puros (normalización, multicriterio, financiero, riesgo) | No conoce Express, PostgreSQL ni HTTP |
| `infrastructure/analytics/algorithmRegistry.js` | Catálogo cerrado de algoritmos ejecutables por nombre+versión | No acepta fórmulas arbitrarias del cliente |
| `repositories/analyticsJobs.repository.js` | Único lugar con SQL de `analytics_jobs` | No contiene reglas de negocio |
| `services/analytics.service.js` | Orquesta ejecución + trazabilidad + límites de tamaño | No contiene fórmulas matemáticas |
| `controllers/analytics.controller.js` | Traduce HTTP <-> casos de uso | No contiene SQL ni matemática |
| `routes/analytics.routes.js` | Auth, organización, RBAC, mapeo URL->controller | No contiene lógica |

## Integración vertical actual (los 3 casos de alto valor implementados)

1. **Multicriterio (TOPSIS) → Comparador Inteligente**
   `backend/services/analysis.service.js` (`scoreCandidates`) reemplazó la
   suma ponderada manual anterior por `domain/analytics/multicriteria.js`
   (`topsis`/`weightedSum`), agregó análisis de sensibilidad de pesos, y
   registra cada ranking como una fila en `analytics_jobs`.
   Frontend: `frontend/src/pages/AdvancedComparator.jsx`.

2. **Financiero (VPN, TIR, cap rate, payback) → Portafolio Inmobiliario**
   Nuevo panel "Analizar financieramente" en cada lote de
   `frontend/src/pages/RealEstatePortfolio.jsx`, que llama a
   `POST /analytics/financial` con supuestos explícitos del usuario
   (NOI, flujo de caja anual, horizonte, tasa de descuento), separando el
   valor **observado** (avalúo) de los **supuestos** (NOI, flujo futuro).

3. **Riesgo (Monte Carlo, percentiles P5/P50/P95) → Evaluaciones de Riesgo**
   Nuevo panel "Simular riesgo" en cada evaluación de
   `frontend/src/pages/RiskAssessments.jsx`, que llama a
   `POST /analytics/risk-simulation` usando los 4 indicadores de riesgo
   ya almacenados (inundación, deslizamiento, crimen, clima) como medias
   de una distribución normal (desviación estándar documentada como 15%
   del valor, una decisión explícita, no oculta), con semilla reproducible.

## Contratos API (versión inicial)

- `GET /analytics/algorithms` — catálogo de algoritmos disponibles.
- `GET /analytics/jobs` / `GET /analytics/jobs/:id` — historial de ejecuciones de la organización activa.
- `POST /analytics/multicriteria` — `{ method, alternatives, weights, directions }`.
- `POST /analytics/multicriteria/sensitivity` — igual + `perturbationPct`.
- `POST /analytics/multicriteria/ahp-weights` — `{ pairwiseMatrix, criteriaKeys }`.
- `POST /analytics/financial` — `{ algorithm: 'npv_irr'|'cap_rate'|'payback'|'dcf', ... }`.
- `POST /analytics/risk-simulation` — `{ algorithm: 'monte_carlo'|'stress_test'|'geographic_concentration'|'components', ... }`.

Todos los endpoints exigen `authenticate` + `requireOrganizationContext` +
`authorizeRoles(ADMIN, ANALYST)` (lectura también permite `VIEWER`), y
limitan el tamaño del payload a 200 KB para evitar abuso.
