
# SOI — registro de implementación y verificación

Fecha: 20 de octubre de 2026, America/Bogota. Repositorio intervenido: `BACKSTAGE-3.1.0`. La copia `BACKSTAGE-3.1.0-main` y la geodatabase externa permanecen sin modificaciones. Existían numerosos cambios locales y archivos sin seguimiento antes de este trabajo; no se restablecieron ni se confirmó un commit.

## Auditoría inicial


CleanCom estaba en `frontend/src/pages/CleanCom.jsx`, `backend/cleancom`, rutas `/clean-com` y un worker Python en `cleancom/`. Es un visor y auditor de artefactos de estudio, no un sistema de flotas en tiempo real. Su catálogo compartía `empresas-varias-2025` entre usuarios autenticados. SOI conserva el caso como DEMO, sin presentarlo como cliente, operación vigente ni fuente de telemetría. Los identificadores y artefactos históricos se mantienen compatibles.

El comparador existente llama `/analysis/compare` con dimensiones territoriales fijas y puede rechazar cálculos cuando faltan fuentes. El nuevo modo configurable emplea evidencia declarada y un baseline determinista compartido. El modo anterior se conserva en una pestaña secundaria; su componente proviene de la copia paralela anterior, como se indica en `SOI_COMPARATOR.md`.

El Explorador anterior consumía `/terrain/surface`, que genera alturas procedimentales. Ese endpoint sigue disponible para pruebas heredadas, pero el Explorador operacional ahora pide `/soi/geo/surface` y usa raster DEM real para 3D. AirHeart ya consultaba Open-Meteo mediante el servicio territorial existente: se reutiliza, diferenciando selección, activo y dispositivo.


## Estado por fase

| Fase | Implementación y diagnóstico | Verificación y límite |
| --- | --- | --- |
| 1. Auditoría y estabilización | Stack, copias, modelos, autenticación, artefactos y datos procedimentales identificados. Se conservaron cambios previos. | Línea base 175/175; sin migraciones ejecutadas. |
| 2. Transformación SOI | Menú SOI, rutas `/soi` y `/soi/routes`, redirección `/clean-com`, API `/soi`, archivo histórico `/soi/historical`. Sectores propios y capacidades; membresía vigente en cada petición SOI. | Pruebas HTTP con JWT y adaptador aislado verifican revocación, roles y tenant. Persistencia real pendiente. |
| 3. Base geográfica | Contratos compartidos de búsqueda, coordenadas WGS84, precisión, reverse y autocomplete Photon configurable; búsqueda explícita Nominatim. Borradores por usuario/empresa, navegación con historial y selectores de mapa excluyentes. | Pruebas de contexto y navegador aislado. Photon no configurado por defecto; no se simula autocomplete. |
| 4. Activos y operaciones | Reutiliza `locations`: categorías, puntos/líneas/polígonos importados, edición, archivo/restauración, país explícito o UNKNOWN. Operaciones, vehículos, incidencias georreferenciadas opcionales, asignación transaccional de activos. CSV/GeoJSON: preview, duplicados por organización, hash y commit atómico. Indicadores separan inventario y procedencia operativa. | Pruebas unitarias y HTTP aisladas. Excel, cuadrillas, órdenes de servicio e integraciones de ERP específicas quedan pendientes. |
| 5. AirHeart y cartografía | Meteorología y pronóstico existentes reutilizados; ubicación de activo/selección/dispositivo identificada; retorno con contexto. Etiquetas sin superposición forzada. | Regresión de servicios existentes aprobada; no se atribuye meteorología a sensores propios. Uso comercial exige condiciones/plan autorizado del proveedor. |
| 6. Comparador | 2–6 candidatos; criterios, fuentes, unidades, pesos, restricciones, ausentes, explicación y recalculado reactivo. Snapshot recalculado en servidor y exportación JSON. | 5 pruebas específicas, además de persistencia/validación del núcleo. GWO no se aplica a ordenar seis candidatos. No hay suscripción configurada a medidas externas. |
| 7. Terreno 3D | MapLibre `raster-dem` Terrarium Mapzen, cámara y exageración vertical. GLO-90 para superficie, pendiente, curvas y perfiles; sin sustitución por alturas sintéticas ante errores. | Consulta DEM real aprobada: 16 muestras, 1.775–3.006 m y 15 curvas. Muestreo grueso; render 3D con red real no validado en navegador. No constituye levantamiento topográfico. |
| 8. Route Intelligence | OSRM: origen/destino, paradas, orden, geometría vial, alternativas, maniobras, planes guardados/recuperables y vínculo con operación. Perfiles peatón/bicicleta requieren servidores propios configurados. | Miami–Los Ángeles real: **4.399,7982 km**, **172.815,6 s**, una alternativa, 22.105 puntos y 69 maniobras. Sin tráfico en vivo. |
| 9. GPS y flotas | GPS del navegador con permiso y consentimiento, estados, precisión, desviación, recálculo, historial propio, retención declarada y validación de saltos/timestamps. Inventario de vehículos y asociación con operaciones. | Pruebas GPS aisladas. No se verificó dispositivo físico ni se configuró proveedor telemático de flotas; los vehículos declarados no se presentan como conectados. El GPS de usuario no se atribuye a un vehículo. |

## Archivos y componentes

Se reutilizan `auth`, `organization.service`, `db.withTransaction`, `locations`, roles, auditoría, `territoryResolver`, `territoryLive`, el motor de pendientes/curvas y el componente cartográfico heredado. No se crea una plataforma separada.

Backend nuevo: `services/soi.service.js`, `services/soiGeo.service.js`, `services/soiTrips.service.js`, routers correspondientes y `middleware/soiOrganizationContext.js`; pruebas SOI en `domain/`, `services/` y `routes/`. Integración modificada: `index.js`, `middleware/auditLogger.js`, servicio/repositorio/catálogo de artefactos históricos. La auditoría omite cuerpos y parámetros GPS y contenido bruto de importaciones.

Frontend: páginas `SoiWorkspace`, `SoiRoutes`, comparador configurable/legacy y CSS SOI; bibliotecas `soi.js`, `soiNavigation.mjs`; cambios en `App`, contexto territorial, buscador, Explorador, AirHeart y visor histórico/mapa. Se agregan pruebas de navegación y el script de navegador `frontend/scripts/soi-browser-smoke.mjs`. Motor común: `shared/soiComparison.mjs`.

Migraciones preparadas, **no ejecutadas**:

- `1680000020000_add_soi_core`: configuración, importaciones, vehículos, operaciones, incidencias, viajes/posiciones y comparaciones. Convierte la unicidad global del ID externo en unicidad por organización sin eliminar filas.
- `1680000021000_add_soi_route_plans`: planes viales y vínculo tenant/operación.
- `1680000022000_add_soi_trip_lifecycle`: estados y retención de viajes.
- `1680000023000_add_soi_operation_assets`: vínculos tenant/operación/activo y metadata de incidencias.

Los activos conservan geometría JSONB existente. Las tablas nuevas usan claves compuestas para referencias entre organizaciones. No se cambiaron claves históricas, nombres físicos del archivo ni base de datos. Las reversiones pueden eliminar datos SOI y requieren respaldo y autorización; no se ejecutaron.

## Ejecución y dependencias


1. `npm test --prefix backend` ejecuta regresión aislada. El caso de red opt-in aparece omitido por diseño; existen evidencias externas separadas.
2. `npm test --prefix frontend` ejecuta sesión, contexto y navegación matemática.
3. `python -m unittest discover -s probability -p test_*.py -v` verifica el motor probabilístico existente.
4. `npm run build --prefix frontend` compila la aplicación.
5. `node frontend/scripts/soi-browser-smoke.mjs` usa Chrome headless local y **APIs de prueba aisladas**, sin datos de producción. Puede configurarse `SOI_TEST_BROWSER`. Verifica módulos, borrador, botón Atrás, configuración y entradas Miami–Los Ángeles; no verifica el GPS físico ni consultas DB.
6. `npm run verify:soi-route` consulta OSRM real y guarda evidencia únicamente si pasa. `node backend/scripts/verify-soi-dem.js` verifica DEM real. Requieren acceso de red autorizado.

Configuración SOI: `SOI_PHOTON_URL`, `SOI_OSRM_DRIVING_URL`, `SOI_OSRM_WALKING_URL`, `SOI_OSRM_CYCLING_URL`, `SOI_ELEVATION_URL` y `SOI_GPS_RETENTION_DAYS` (1–365, por defecto 30). Sin Photon, la búsqueda explícita permanece operativa; no se usa Nominatim como autocompletado. El endpoint de elevación configurable debe conservar contrato y procedencia GLO-90. La visualización Mapzen usa fuentes regionales y resolución variable; atribuciones se muestran en el mapa con enlace a [fuentes y licencias](https://github.com/tilezen/joerd/blob/master/docs/attribution.md), siguiendo el [contrato raster DEM de MapLibre](https://maplibre.org/maplibre-style-spec/sources/#raster-dem).

La retención limita consulta/ingesta y dispone de eliminación propia de viajes vencidos y script administrativo `backend/scripts/soi-gps-retention.js`. Este último es **solo lectura por defecto**; `--apply` elimina viajes vencidos y posiciones relacionadas, y exige autorización y una política operacional aprobada. No se ejecutó. La eliminación no está programada automáticamente y la interfaz de consentimiento lo indica. El navegador no garantiza seguimiento en segundo plano ni entrega de una última transición durante cierre/pérdida de red.

## Evidencias y bloqueos

Verificación final ejecutada sobre la integración:

| Comprobación | Resultado |
| --- | --- |
| `npm test --prefix backend` | 225 casos: **224 aprobados**, 0 fallos, 1 prueba de red optativa omitida. |
| `npm test --prefix frontend` | **13 aprobados**, 0 fallos. |
| Motor probabilístico Python | **6 aprobados**; advertencia existente de ajuste numérico SciPy, sin fallo de prueba. |
| `npm run build --prefix frontend` | Compilación correcta. Advertencias de API CJS Vite y tamaño del paquete MapLibre; no son una validación de rendimiento de producción. |
| Chrome headless sobre compilación final | **6 comprobaciones de interfaz**, 0 excepciones de ejecución. APIs y cartografía externas aisladas por el test; no prueba persistencia real. |
| OSRM externo | Prueba real Miami–Los Ángeles aprobada y evidencia guardada. |
| DEM externo | Prueba real de 16 muestras y curvas aprobada y evidencia guardada. |

La prueba de red omitida en la suite no se cuenta como aprobada; las consultas reales de rutas y DEM se ejecutaron por separado con sus scripts explícitos. La compilación final es posterior a los cambios de interfaz y la prueba de Chrome se repitió sobre esa compilación.

- Evidencia vial: [`evidence/soi-miami-la-live.json`](evidence/soi-miami-la-live.json).
- Evidencia DEM: [`evidence/soi-dem-live.json`](evidence/soi-dem-live.json).
- Detalle de APIs y límites: [`SOI_CORE.md`](SOI_CORE.md), [`SOI_GEO.md`](SOI_GEO.md), [`SOI_COMPARATOR.md`](SOI_COMPARATOR.md).
- No se dispone de una fuente autorizada de posiciones de vehículos ni de un dispositivo físico autorizado para verificar GPS. No hay vehículos conectados inventados.
- Persistencia, migraciones, perfiles geográficos específicos, importación Excel, modelos sectoriales más detallados, cuadrillas/órdenes, cuotas distribuidas y retención automatizada requieren trabajo adicional. No se declara consolidación ni preparación final para producción.

Siguiente incremento: validar migraciones y flujos A–E en staging con dos organizaciones, conectar fuente telemática autorizada, verificar navegación/GPS físico y cerrar los componentes operacionales pendientes. El código independiente y las pruebas disponibles ya se implementaron; estos bloqueos no se sustituyen por simulaciones permanentes.
