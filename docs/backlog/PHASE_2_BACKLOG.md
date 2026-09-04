# Backlog verificable — Fase 2 BACKSTAGE (post Analytics Core v1)

Este backlog convierte la especificación completa recibida en épicas con
estado real. Nada se marca como terminado por existir una pantalla: debe
haber comportamiento verificado. Estado posible: `done` (implementado y
probado en esta sesión), `pending` (no iniciado), `blocked` (requiere una
decisión o acceso que no corresponde tomar de forma autónoma).

## Épica 1 — Identidad pública de URL

**Estado: `done`**

- Alias `backstage-intelligence.vercel.app` asignado y verificado (200 OK,
  sin advertencia TLS, login/CORS/SPA-reload probados).
- CORS actualizado en backend, SSO deployment protection deshabilitado
  (bloqueaba el alias).
- Ver `docs/deployment/URL_MIGRATION.md` para el detalle completo, ADR y
  pendientes de dominio propio.

## Épica 2 — BACKSTAGE Analytics Core (motor de cálculo)

**Estado: `done` (alcance acotado a 3 verticales), `pending` el resto**

Implementado y probado (53 pruebas unitarias, 0 fallidas; verificado en
navegador contra datos reales):

- Catálogo de algoritmos cerrado y versionado (`algorithmRegistry.js`).
- Normalización, multicriterio (weighted sum, TOPSIS, AHP + consistencia,
  sensibilidad), financiero (VPN, TIR, cap rate, payback simple/descontado,
  DCF), riesgo (threat×exposure×vulnerability, Monte Carlo con semilla,
  percentiles P5/P50/P95, stress test, concentración geográfica HHI).
- Tabla `analytics_jobs` con trazabilidad completa (usuario, organización,
  algoritmo, versión, parámetros, resultado/error, duración).
- Integración vertical real en 3 módulos: Comparador Inteligente (TOPSIS),
  Portafolio Inmobiliario (financiero), Evaluaciones de Riesgo (Monte Carlo).

**Pendiente (`pending`, no bloqueado, solo no priorizado en esta fase):**

- Worker asíncrono separado con cola real (`queued/running/succeeded/failed/cancelled`
  fuera del ciclo HTTP). Hoy la ejecución es síncrona pero con el mismo
  contrato de estados; ver justificación en `docs/analytics/ARCHITECTURE.md`.
- Extender el motor a EarthArt, Recomendaciones y Oportunidades (los 3
  verticales elegidos fueron Comparador, Portafolio y Riesgos).
- Migrar duplicación de fórmulas si en el futuro Python vuelve a
  necesitarse para algo que Node no cubre bien (ninguna duplicación existe
  hoy: todo el álgebra vive únicamente en `domain/analytics/*.js`).

## Épica 2A — Roles, permisos y gobierno multi-organización

**Estado: `pending` (no iniciado)**

El sistema actual usa 3 roles (`admin`, `analyst`, `viewer`) con
`user_roles` ya vinculado a organización (multi-org funcional a nivel de
esquema), pero **no** implementa los 12 roles granulares del documento
(Platform Superadmin, Organization Owner, Data Manager, GIS Analyst, Data
Scientist, Risk Analyst, Portfolio Manager, Decision Analyst,
Executive/Approver, Auditor) ni permisos atómicos (`asset.read`,
`model.approve`, etc.). Este es un cambio transversal a todos los
controllers y a la UI de permisos; no se tocó en esta fase para no
introducir regresiones de acceso sin una ventana de pruebas dedicada.
Requiere: diseño de tabla `permissions` + `role_permissions`, middleware
`requirePermission(...)`, y migración de cada ruta existente.
`docs/security/RBAC_MATRIX.md` pendiente de creación junto con esa épica.

## Épica 3 — Aprendizaje automático / redes neuronales

**Estado: `blocked` por datos insuficientes (decisión técnica correcta, no incumplimiento)**

Se auditó el estado de datos disponible: la base de datos productiva
tiene datos demo/sintéticos de un puñado de ubicaciones y 6-11 lotes
inmobiliarios (ver `docs/deployment/URL_MIGRATION.md` y trabajo de la
sesión anterior de seeding). Esto **no constituye un dataset válido para
entrenar y evaluar honestamente** ningún modelo predictivo (no hay
separación train/validation/test con volumen ni variabilidad real).
Siguiendo la regla explícita del documento ("si no se cumplen las
condiciones, implementa el mejor modelo convencional y registra que una
red neuronal no está justificada"): el mejor modelo convencional
disponible hoy son los algoritmos deterministas de la Épica 2
(multicriterio, financiero, riesgo), que sí están implementados. No se
entrenó ningún modelo de ML/red neuronal. Antes de iniciar esta épica se
necesita:

- Una fuente de datos real (no demo) con volumen y periodo suficiente
  por caso de uso (valorización, demanda, clasificación de riesgo, etc.).
- Definición de la variable objetivo, horizonte y unidad de análisis por
  caso (ficha por candidato, según el documento).
- Autorización del propietario para conectar o adquirir esa fuente.

## Épica 4 — Mapas BI y ecosistema QGIS/PostGIS

**Estado: `pending`**

El Explorador Territorial ya tiene un mapa MapLibre real, capas desde
PostGIS y filtros de capas (trabajo de la sesión anterior). No implementa
todavía: coropletas/símbolos proporcionales/heatmaps interactivos ligados
a KPIs, isolíneas/isócronas (requiere proveedor de rutas, ver Épica 5),
publicación de estilos QGIS reproducibles hacia PostGIS/tiles, ni
evaluación de GeoServer/pg_tileserv/Martin. No se inició por ser un
proyecto de varias semanas en sí mismo; el mapa actual usa PostGIS
directamente vía API propia, sin dependencia de QGIS en producción, lo
cual ya cumple parcialmente el principio de "no depender de QGIS
manualmente en producción".

## Épica 5 — Integraciones con APIs externas

**Estado: `pending`**

No se contrató ni configuró ninguna API externa (geocodificación, rutas,
DANE/IDECA, clima, catastro, almacenamiento de documentos). Requiere
decisiones de proveedor, presupuesto y licenciamiento que corresponden al
propietario del producto. Cuando se prioricen, deben implementarse como
adapters en `backend/infrastructure/external-apis/` (patrón ya usado por
`infrastructure/analytics/`), nunca llamados directamente desde React.

## Épica 6 — Rediseño de Evaluaciones y Recomendaciones como dashboards

**Estado: `pending`**

Evaluaciones de Riesgo ganó una capacidad real nueva (simulación Monte
Carlo) pero conserva su listado tipo tarjetas + formulario CRUD; no se
convirtió en el dashboard completo descrito (mapa + distribución por
estado + evolución temporal + flujo guiado desde activo/proyecto/mapa).
Recomendaciones no se tocó en esta fase. Ambas quedan pendientes como
proyecto de UI propio, priorizable en una próxima fase.

## Resumen de verificación de esta fase

| Criterio del documento | Cumplido |
|---|---|
| Al menos un flujo analítico completo end-to-end (UI -> DB -> resultado) | Sí, 3 flujos (Comparador, Portafolio, Riesgos) |
| Cálculos desde algoritmos versionados, no constantes | Sí (ver `algorithmRegistry.js`, `analytics_jobs.algorithm_version`) |
| Pruebas matemáticas con casos dorados, propiedades y límites | Sí (53 pruebas, `backend/domain/analytics/__tests__`) |
| Trabajos largos asíncronos y recuperables | Parcial: mismo contrato de estados, ejecución síncrona (justificado) |
| RBAC granular por permiso | No — sigue con 3 roles (bloqueado como Épica 2A) |
| Ningún modelo de ML presentado como entrenado sin dataset/evaluación | Correcto — no se entrenó ninguno (Épica 3 bloqueada explícitamente) |
| Mapas BI, QGIS/PostGIS pipeline, APIs externas | Pendiente (Épicas 4 y 5) |
| Evaluaciones/Recomendaciones como dashboards completos | Pendiente (Épica 6) |
