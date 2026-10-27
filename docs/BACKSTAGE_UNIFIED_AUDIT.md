# BACKSTAGE · auditoría de la visión unificada

Actualización del 26 de octubre de 2026: la [arquitectura autónoma nativa](BACKSTAGE_NATIVE_TRUST_ARCHITECTURE.md) sustituye las dependencias SATYA/Vault mencionadas como posibilidades en esta auditoría histórica. No se esperarán esos servicios para desarrollar BACKSTAGE.

25 de octubre de 2026, Bogotá. Auditoría realizada antes de modificar código del incremento Propiedad Horizontal. El adjunto recibido termina en 3.3 → Administración → Proveedores; el propietario confirmó el truncamiento y completó la visión en el chat. Autorizó auditoría y base territorial de PH, y pidió esperar la especificación complementaria antes de implementar las otras capacidades. [Inventario reproducible](evidence/unified-repository-audit.json).

El repositorio conserva trabajo previo sin confirmar en Git. Se copian los archivos que va a tocar este incremento en un directorio privado `.vercel/ph-before-*`; no se resetea el árbol ni se interpreta el diff acumulado como trabajo nuevo. El backup de código no sustituye el de Atlas.

## Stack y componentes reutilizables

React 18, Vite 5 y MapLibre 6; Express 4 y Node 24; MongoDB Atlas mediante driver 6 y transacciones. Motores Python científicos existentes con NumPy/SciPy/Shapely/PyProj y paquetes específicos. Esta fase no añade paquetes, Docker, redes blockchain ni instalaciones pesadas.

| Capacidad | Estado comprobado en código/evidencias | Límites |
| --- | --- | --- |
| Explorador | MapLibre 2D, relieve/3D, globo, fuentes GeoJSON, selección, capas y paneles; `NativeTerritorialExplorer`, `ExplorerWorkspace` | Visibilidad condicionada por fuentes; un relieve procedural se etiqueta simulado. Accesibilidad y aceptación humana integrales pendientes. |
| Navegación | Cuatro destinos en `navigationRegistry.mjs`: Explorador, Feed, Cuenta, Organización | Herramientas heredadas permanecen contextuales; PH no recibirá una sección principal. |
| Activos/proyectos | `locations`, activos SOI y referencias canónicas; API de activos, comparación y contexto de proyecto | El portafolio inmobiliario no es administración de copropiedades. No existe jerarquía PH implementada. |
| Identidad/permisos | Usuarios, organizaciones, membresías, sesiones, RBAC admin/analyst/viewer y autorización vigente de recursos | No se encontraron implementaciones llamadas SATYA o Vault que puedan declararse integradas. No renombrar autenticación para simularlas. |
| Auditoría/integridad | Cadena SHA-256 por organización, eventos dentro de transacción y manifiestos de cálculos | Una cadena hash no es firma digital ni blockchain; Hebra transversal cifrada/versionada no está implementada por existir esos hashes. |
| Centro de Operaciones/BCO | MissionControl, API computacional, leases, reintentos, backoff, cuotas, outbox y ejecución aislada real Vercel | Harness de aceptación alojado; no es scheduler productivo general. Monitor externo y alerta recibida pendientes. |
| SOI | Flota, rutas, residuos, sensores aportados, carbono, analítica y operaciones sanitarias | Se conserva exclusivamente sanitario. GPS real sin proveedor. No se trasladará PH a SOI. |
| Airheart | Interfaz `EarthArt.jsx` etiquetada AirHeart, servicios territoriales, brechas, índices y contexto meteorológico | Denominación heredada de archivos conservada; las heurísticas y escenarios no son mediciones verificadas. |
| Matemática/espacial | Registro cerrado y motores BSIE: pesos, Moran global/local, Gi*, KDE, temporal, regresión; GIS y evidencia existentes | No se reimplementan. Anomalías avanzadas y algoritmos originales requieren especificación/validación propia. |
| Económica | VAN/TIR, DCF, cap rate, payback, comparación, decimal y evidencia reproducible | No existe motor completo de cartera PH, pagos, presupuesto ni sostenibilidad económica. |
| IA | Contratos, catálogo de algoritmos y evaluación defensiva con aprobación | No se encontró un nuevo proveedor generativo operativo. Contratos y reglas no equivalen a un modelo entrenado. |
| Feed/colaboración | Publicaciones, comentarios y audiencias autorizadas en `operational_events` | No constituye Community documental completo ni Colab para alianzas/intercambio general. |
| Normativa | Reglas comerciales versionadas y trazabilidad disponibles | No hay diccionario normativo/jurídico completo ni evaluación legal que pueda anunciarse operativa. |
| PH | Ausente antes de este incremento; activos y auditoría compartidos reutilizables | Cartera, pagos, PQRS, portería, reservas, asambleas, personas y operaciones esperan especificación. |

## Persistencia, deuda y dependencias

`platformMongo` centraliza conexión, transacciones e inicialización aditiva de índices; `mongoIndexRegistry` conserva colecciones. `resourceAuthorization.currentActor` revalida organización, usuario, membresía y sesión. PH debe reutilizar estos mecanismos y la colección canónica `locations`, evitando una base, sistema de personas o auditoría paralelos.

Hay servicios legacy con autorización en router y otros con autorización transaccional; cualquier escritura PH requiere ambas. Los endpoints genéricos de ubicaciones no deben permitir saltarse restricciones de jerarquía y coeficientes. Las herramientas heredadas y archivos con nombres EarthArt/AirHeart se conservan; sus duplicaciones requieren revisión gradual, sin borrar recorridos existentes.

Las APIs externas Mapbox/OSRM/OSM y meteorología dependen de cobertura, cuotas y términos; no se contrata ni cambia ningún plan. Correo, GPS, monitor externo y administración Atlas siguen con dependencias de cuenta/destino. La lectura de catálogos satelitales existente no equivale a análisis de imágenes ni datos propios verificados. Ninguna capacidad pendiente se activa mediante interfaces ficticias.

Regresión previa documentada: 396 backend, 395 aprobadas, una omitida. Los resultados nuevos se registrarán por separado; un inventario estático no certifica todos los módulos. Producción mantiene su versión anterior y NO_GO operativo. [Plan incremental](BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md), [pendientes productivos](BACKSTAGE_PRODUCTION_GO_NO_GO.md).
