# Inventario funcional y límites — BACKSTAGE 2.0

Estado: inspección de código y pruebas locales. “Existente” significa implementación localizada, no certificación de todos los recorridos del propietario. No se crearon módulos o conectores para esta auditoría.

| Capacidad | Implementación localizada | API/datos principales | Estado y destino propuesto |
| --- | --- | --- | --- |
| Shell, sesión y contexto | App.jsx, lib/auth, lib/api, operationalContext | `/auth/*`, organización y cabeceras | Platform Core; preservar navegación y recuperación de sesión |
| Identidad y organizaciones | mongoIdentity/organization/users services, RBAC | identity_users/organizations/memberships | Existente en Atlas; faltan invitación, OIDC/MFA y revocación completa |
| Auditoría | soiMongoAudit, middleware, AuditLogsAdmin | `/audit-logs`, cadena de eventos/cabezas | Transversal; reparar transporte y revisar permisos |
| Command empresarial | MissionControl, métricas, supervisor y comandos | insights, análisis, eventos, operaciones | Pantalla conservada pero relegada; recuperar entrada principal |
| Explorer | NativeTerritorialExplorer, SpatialSearch, backend/spatial | `/spatial`, `/terrain`, llamadas `/soi/geo` y `/soi/assets` | Mapa existente; conservar herramientas y separar contratos industriales |
| Activos/portafolio | RealEstatePortfolio, locations, valoraciones | `/locations`, `/real-estate`, locations/property_valuations | Recuperar acceso; UI inmobiliaria no es aún gestor universal completo |
| Proyectos | RetailZones, analysis.repository, workflow | `/analysis/projects`, candidatos/riesgos/probabilidad/informes | Recorridos existentes para varios sectores; preservar contexto e historial |
| Comparación | AdvancedComparator, LegacyAdvancedComparator, shared/soiComparison y multicriterio | `/analysis/compare`, `/analytics/multicriteria`, `/soi/comparisons` | Dos recorridos existentes; capacidad transversal sin industria impuesta |
| AirHeart/territorio | EarthArt, LiveTerritoryOverview, earthart.js | `/territorial`, índices, brechas y simulación | Panel preservado; heurísticas no equivalen a evidencia causal o forecast validado |
| Estadística | probability/statistical_engine.py, ProbabilityEngine | Rutas de probabilidad/análisis | Motor y pruebas numéricas existentes; preservar supuestos/versiones |
| Financial Modeling | domain/analytics/financial.js y panel financiero | `/analytics/financial`, valoraciones | VPN/TIR/cap rate/payback; falta contrato monetario decimal/moneda completo |
| Multicriterio/riesgo | domain/analytics/normalization, multicriteria, risk | `/analytics/*`, recomendaciones | Motores puros probados; no simplificar ni duplicar |
| Spatial Intelligence/BSIE | bsie/engine.py, temporal.py, bsie.service, BsiePanel | `/soi/bsie/*`, bsie_jobs/weights | Pesos, Moran/LISA, Gi*, KDE, OLS/modelos espaciales y temporal; motor compartible hoy bajo SOI |
| Rutas/flota | SoiRoutes, geo/trips/fleet services | `/soi/geo`, `/soi/trips`, `/soi/fleet` | Rutas/DEM implementados; no proveedor GPS vehicular autorizado según evidencia previa |
| Optimization | sanitary/routing.py, analytics sanitario | Propuestas/optimización y aprobación | OR-Tools CVRP/VRPTW; no optimizador universal de todos los procesos |
| Predictive | sanitary/predictive.py | Corridas y predicción sanitaria | Ridge con backtesting/baseline y anomalías MAD; no suite general MLOps/clasificación |
| SOI | SoiWorkspace, SanitaryWorkspace y servicios/contratos | `/soi/*`, residuos/agua/carbono/sensores | Mantener industria sanitaria; no usar como núcleo global |
| Clean Com | CleanCom, CleanComMap, procesador, catálogo/casos | `/clean-com`, `/soi/historical`, artefactos privados | Caso/código preservados; acceso global redirigido; revisar fuente/clasificación antes de cambiar datos |
| Integraciones | ingestion, integrations service, live sources, adaptadores sanitarios | Fuentes/eventos generales y conectores de lectura | Piezas existentes; no Registry/Gateway universal completo |
| Eventos/automatización | EventEmitter, wsServer, supervisor, autoRecovery | Eventos, historial y sondeo | Local/proceso y persistencia parcial; no streaming distribuido garantizado |
| UI compartida | components/ui, CSS global/páginas, OrbitalEntry/Globe, AccessFrame | Tokens y siete componentes básicos | Reutilizar; no reemplazar por plantilla |

## Fuentes e integraciones

- Nominatim: búsqueda explícita y lease/cooldown Mongo. Photon es opcional para autocompletar. El código no certifica condiciones contractuales actuales.
- OSRM: ruta y matriz con fuente/configuración; perfiles dependen de URLs disponibles. Un servidor público no garantiza capacidad empresarial.
- Open-Meteo: clima/elevación con fuente/fecha. Deben revisarse condiciones comerciales antes de certificar uso empresarial.
- OpenStreetMap/OpenFreeMap/OpenMapTiles: mapas, lugares y atribución existentes. Overpass maneja indisponibilidad y no se considera conectado por estar listado.
- Traccar y adaptadores ambientales/industriales: lectura limitada con secretos en servidor. Sin proveedor no hay telemetría real ni control de maquinaria habilitado.
- Google Identity, Gmail, ERP, POS, CRM, MQTT y conectores financieros: no se encontró un flujo completo implementado y verificado en este repositorio. No se habilitaron ni se pidieron credenciales.

No se consultaron proveedores ni se enviaron mensajes durante Fase 0. Las fixtures científicas no prueban conexiones operativas.

## Capacidades futuras que no deben anunciarse como listas

Connect, Collaborate, Live distribuido, Connected Intelligence Graph, nuevos módulos industriales, archivos compartidos, notificaciones universales y COMMAND/EXPLORE/ANALYZE/OPERATE son evolución propuesta. Hay componentes reutilizables, no productos completos certificados. Cada industria debe comenzar por un caso extremo a extremo verificable.

## Límites propuestos

El shell compone módulos mediante contratos/rutas explícitos; la lógica general no importa implementaciones sanitarias. Atlas, identidad, auditoría, activos y motores puros son generales por responsabilidad, aunque algunos nombres actuales incluyan soi. SOI conserva sus recursos sanitarios. Cambiar responsabilidad o nombre de un servicio no autoriza renombrar colecciones, documentos o IDs.
