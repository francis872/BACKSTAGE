# SOI — API y operación sanitaria

Este incremento amplía Backstage con MongoDB; no reemplaza sus módulos históricos. Base: `/soi/sanitary`. Todos los endpoints requieren JWT y una membresía vigente. El servidor obtiene la organización de esa membresía; `organization_id` no se admite en cuerpos. Un encabezado `x-organization-id` ajeno se rechaza. Las capacidades se habilitan por organización en Configuración de SOI.

## Contrato y permisos

`GET /openapi.json` entrega OpenAPI 3.1 generado desde `backend/soi/sanitary.contract.js`. `GET /catalog` devuelve solo los recursos habilitados, sus campos, unidades y referencias. Admin/analyst pueden crear y modificar; viewer consulta. Configurar integraciones, aprobar escenarios y anular ledgers requiere admin. La API base de SOI conserva sus propias reglas.

Recursos: `waste-categories`, `facilities`, `containers`, `waste-movements`, `stations`, `sensors`, `measurements`, `alert-rules`, `alerts`, `networks`, `inspections`, `emission-sources`, `emission-factors`, `carbon-entries`, `route-executions`, `optimization-scenarios`, `prediction-runs`, `climate-assessments`, `reports`, `integrations`.

| Operación | Endpoint |
|---|---|
| Crear, listar | `POST/GET /resources/{kind}` |
| Detalle, modificar | `GET/PATCH /resources/{kind}/{id}` |
| Revisiones anteriores | `GET /resources/{kind}/{id}/history` |
| Anular con motivo | `POST /resources/{kind}/{id}/void` |
| Reconocer/resolver alerta | `POST /alerts/{id}/state` |
| Indicadores y eventos | `GET /dashboard`, `GET /events?after=0` |
| Snapshot y exportación | `POST /reports`, `GET /reports/{id}/export` |
| Optimizar/aprobar/comparar | `POST /optimization`, `POST /optimization/{id}/approve`, `GET /optimization/{id}/compare?execution_id=...` |
| Analítica temporal | `POST /predict` |
| Recuperación/cancelación | `POST /executions/{kind}/{id}/retry`, `POST /executions/{kind}/{id}/cancel` |
| Clima/cobertura | `POST /climate`, `POST /coverage` |
| Estado/sincronización autorizada | `GET /integrations/{id}/status`, `POST /integrations/{id}/sync` |

Listado: `limit` 1–200, `offset` 0–100000, `status`, `from` inclusivo, `until` excluyente; fechas ISO 8601 con zona. Hay filtros de referencias `sensor_id`, `category_id`, `source_id`, `vehicle_id`, `network_id` y `data_kind`. Cada consulta incluye el tenant. El dashboard aplica fechas al período de actividad; las alertas y el estado de sensores representan el estado actual. Los cambios usan `revision` para detectar concurrencia. Campos desconocidos se rechazan. No hay borrado de registros operativos desde esta API.

Ledgers de medición, factores y carbono son inmutables. Residuos y ejecuciones admiten `planned → in_progress → completed` o cancelación; no se reescriben movimientos terminados. Las anulaciones de residuos, medición y carbono conservan el original, motivo y actor. El historial guarda el snapshot anterior en la misma transacción. `event_id` repetido con el mismo contenido devuelve el registro existente; un contenido diferente produce 409. Los eventos de dominio son duraderos y paginados por cursor.

## Residuos, ambiente y saneamiento

Crear primero activos, categoría e instalación; después contenedor y movimiento. Un movimiento referencia origen, destino, categoría, fecha, cantidad, unidad, naturaleza y fuente. `kg` y `t` se convierten de forma explícita; `m3` y `L` permanecen como volumen, sin densidad supuesta. Solo movimientos completados y no anulados entran en masa/costos; las monedas y naturalezas se suman por separado. La última recolección se calcula a partir de movimientos válidos, incluso después de una anulación.

Estación → sensor → mediciones. El sensor declara variable, unidad, instrumento, método y frecuencia esperada. La lectura exige la misma unidad y no puede tener fecha futura. `measured`, `estimated`, `forecast` y `simulated` permanecen diferenciados. No se certifica automáticamente la fuente. Calidad `invalid` no actualiza el valor actual ni las alertas. El estado conserva la última lectura por naturaleza; una simulación no suprime alertas medidas. Los registros atrasados se conservan sin sobrescribir la observación más reciente de su naturaleza. Una anulación recalcula el estado y resuelve la alerta sustentada en el registro anulado; una observación válida anterior aún excedida puede abrir una nueva alerta identificable.

Las reglas tienen naturaleza explícita, umbral en la unidad del sensor, operador y severidad. No equivalen a límites regulatorios certificados. Reconocer o resolver requiere `{ "revision": 1, "status": "acknowledged", "reason": "Justificación" }`. Una alerta resuelta permanece en el historial. Sin mediciones se muestra `NO_MEASUREMENTS`; vencida la cadencia declarada se muestra `STALE`.

Redes sanitarias enlazan geometrías del inventario y mantenimiento previsto. Las inspecciones registran tipo, hallazgos, severidad y evidencias; pueden enlazar una orden real de SOI, que ya contiene operación, cuadrilla y activos. No existe conexión de control industrial.

## Carbono

Fuente con alcance 1/2/3 y límite organizacional → factor inmutable con versión, fuente HTTPS, metodología, unidad, vigencia e incertidumbre declarada → actividad. El servidor calcula `actividad × factor`, fija el snapshot del factor y registra kgCO₂e. Solo convierte kg↔t. Una actividad medida produce emisiones **estimadas**; una actividad simulada permanece simulada. No hay factores oficiales precargados ni certificación de inventario.

`activity_reference` identifica una entrada/version única. Para corregir: anular con `{revision, reason}`, crear otra entrada con `correction_of_id` y una nueva `activity_reference`. Se conserva la referencia empresarial original y un índice parcial impide dos entradas activas para esa actividad. El informe excluye anulaciones sin borrarlas.

## Optimización

Ejemplo de estructura; sustituir IDs por activos/vehículos propios. Esta matriz es una **fixture simulada**, no una red vial real:

```json
{
  "name": "Escenario matemático de prueba",
  "nodes": [{"asset_id": 11, "demand_kg": 0}, {"asset_id": 12, "demand_kg": 5, "service_s": 60, "time_window_s": [0, 3600]}],
  "vehicles": [{"vehicle_id": 3, "capacity_kg": 10, "start_index": 0, "end_index": 0, "shift_s": [0, 7200]}],
  "matrix": {"node_ids": ["11", "12"], "distance_m": [[0, 1000], [1000, 0]], "duration_s": [[0, 120], [120, 0]], "source": {"name": "Fixture matemática, no vías reales", "data_kind": "simulated"}},
  "time_limit_s": 3
}
```

Alternativamente `matrix_source: "osrm"` consulta la matriz vial del proveedor configurado en `SOI_OSRM_DRIVING_URL`. En producción se exige configuración; en desarrollo se permite el servidor público de OSRM, sujeto a su disponibilidad. No se sustituyen distancias faltantes por líneas rectas. Las matrices importadas requieren `node_ids` en el orden exacto de `nodes`; la geometría se obtiene del inventario del tenant.

Límites: 2–100 nodos, 1–20 vehículos, una carga por vehículo, sin descargas intermedias. Capacidad kg explícita; otra unidad registrada exige fuente de conversión. CVRP/VRPTW admite depósitos por vehículo, turnos, tiempo de servicio, ventanas, prioridades, visitas opcionales y penalizaciones. OR-Tools resuelve y una comprobación independiente valida visitas obligatorias, capacidad y tiempos. El objetivo combina distancia, tiempo, costo, emisiones, penalización y carga máxima con pesos y escalas declaradas. Optimizar costo exige tarifas/moneda; emisiones exige factor vehicular y fuente. Los valores ausentes se muestran como desconocidos.

Se almacena la entrada y resultado versionados: `PROPOSED`, `INFEASIBLE` solo con evidencia de inviabilidad, o `NO_SOLUTION_FOUND` si vence el límite. La optimalidad global no se afirma sin prueba del solver. Aprobar requiere admin y revisión vigente; se comprueba que activos y vehículos no hayan cambiado. La aprobación no despacha flota. Reoptimizar consiste en crear otro escenario con nuevas restricciones/datos y comparar; no hay cambios automáticos sobre una ruta en ejecución. La comparación con ejecuciones distingue distancia planificada, evidencia ejecutada y propuesta, sin acreditar ahorros futuros como obtenidos.

Los procesos se registran antes de ejecutar, poseen lease de 60 s y admiten hasta tres intentos. El puente Node/Python comparte límite de dos procesos globales y uno por organización, entradas 4 MB, resultados persistidos 8 MB y timeout 30 s. La cancelación se verifica durante el cálculo; un resultado tardío no sobrescribe el estado cancelado. Un worker interrumpido se recupera mediante reintento explícito después de vencer su lease.

## Predicción, clima y cobertura

`POST /predict`: `{name, operation: "forecast" | "anomalies", sensor_id}` usa mediciones válidas reales del sensor. Alternativamente `{history: [{time, value}], unit, source: {name, data_kind}, horizon, lags}` permite una serie declarada. Son necesarias 20–1000 observaciones regulares; no se imputan faltantes. Ridge autorregresivo evalúa folds cronológicos de un paso, compara persistencia y publica MAE/RMSE/skill. Solo publica pronóstico con mejora ≥5%; historia vencida o insuficiente habilidad no publica pronóstico actual. `allow_exploratory: true` produce simulación explícita. Una fuente simulada conserva esa naturaleza aun con buen backtest. El horizonte máximo es 30 períodos. El rango empírico no tiene cobertura probabilística calibrada. MAD usa referencia inicial separada de la evaluación y no diagnostica por sí solo fallos físicos.

`POST /climate`: `{route_plan_id, daily_rain_threshold_mm}` reutiliza el proveedor meteorológico de Backstage en hasta tres puntos de una ruta guardada. Guarda fuente, fechas, unidades, estado disponible/parcial/no disponible y exposición al umbral declarado. No representa alerta oficial ni un modelo hidráulico de inundación. Los fallos externos no generan lluvia ficticia.

`POST /coverage`: `{zone_asset_id, execution_id}` calcula cobertura de puntos de inventario dentro de Polygon/MultiPolygon con exclusión de huecos; no supone que el inventario represente todos los clientes del territorio. El resultado conserva la naturaleza de la ejecución. Los resultados propuestos o simulados no acreditan servicio real.

## Integraciones de lectura

No hay proveedores reales configurados. La integración registra proveedor, autorización y `configuration_key` como `SOI_CONNECTOR_EMPRESA_A`. Solo el operador del servidor puede definir esa variable JSON y su secreto separado `SOI_CONNECTOR_EMPRESA_A_TOKEN`. La configuración debe incluir `organization_id`, `provider`, `url` HTTPS sin credenciales, `token_env` opcional y mapeo `device_map`/`sensor_map`. Una configuración de otra organización se rechaza. No se revelan secretos por API.

Traccar consulta por GET `/api/positions` y exige mapeo de dispositivo a vehículo y fuente de flota previamente autorizada. Rechaza posiciones inválidas, vencidas o con precisión desconocida; convierte nudos a m/s. Referencia: [API oficial de Traccar](https://www.traccar.org/api-reference/). Los contratos ambiental e industrial aceptan `{observations: [{event_id, sensor_key, value, unit, observed_at, data_kind, method, quality}]}` desde un endpoint autorizado GET. Industrial exige `read_only_authorized: true`. No se implementan comandos ni escritura en PLC/SCADA.

Timeout 10 s, máximo 3 MB/1000 observaciones, sin redirecciones. La ingesta es idempotente por evento y puede confirmar una parte antes de un fallo posterior: repetir la sincronización deduplica lo ya aceptado. `last_sync_succeeded` describe una consulta pasada, no conexión continua. Sin configuración el estado es `not_configured`. SIATA/IDEAM requieren una fuente/API y autorización concretas; no se inventan accesos a partir de un portal público.

## Preparación y verificación

1. Configurar `backend/.env` con `SPATIAL_STORE=atlas`, `MONGODB_URI`, `JWT_SECRET`; `MONGODB_DNS_SERVERS` es opcional. No registrar secretos en Git.
2. Crear un virtualenv e instalar `sanitary/requirements.txt`; para referencias científicas añadir `bsie/requirements-test.txt`. Configurar `BSIE_PYTHON` con el ejecutable, o usar `.venv-bsie` en la raíz. `npm run setup:scientific` prepara ese entorno sin tocar MongoDB.
3. Ejecutar `npm run mongo:plan --prefix backend`; revisar y aplicar `mongo:init` sobre el entorno autorizado. Esquema v2 añade colecciones e índices sin eliminar datos. La reversión de código conserva los datos; una versión anterior con comprobación exacta de esquema puede requerir restaurar su metadata o adaptar la comprobación. Verificar compatibilidad antes de revertir; no se proporciona una migración destructiva automática.
4. Ejecutar `npm run test:backend`, `npm run test:frontend`, `npm run test:bsie`, `npm run test:sanitary`, `npm run build`.
5. Solo sobre pruebas autorizadas: `node backend/scripts/verify-soi-mongo-live.js --test-environment`. Crea y elimina exclusivamente una organización temporal propia; conserva contadores/índices. La evidencia registra qué se comprobó contra Atlas, incluida persistencia y cálculo Python real. Las fixtures se identifican y nunca se promocionan a operaciones reales.

Las pruebas de navegador usan API y mapas aislados: validan la interfaz y no prueban conexión con proveedores. Las pruebas unitarias de adaptadores tampoco acreditan una conexión real. Consultar evidencias y estado de fases en [SOI_SANITARY_PROGRESS.md](SOI_SANITARY_PROGRESS.md).

## Límites operativos y despliegue

Los listados son paginados; snapshots/coverage se limitan a 5000 registros por dominio para no producir informes silenciosamente incompletos. El proceso científico tiene límites explícitos; no se presenta como solución distribuida de gran escala. Se debe medir sobre la infraestructura destino antes de ampliar capacidad. Respaldar Atlas y verificar restauración antes de cualquier futura migración destructiva.

El frontend requiere proxy autenticado hacia la API. El despliegue vigente usa Node 24 y una función Python 3.12 dentro del proyecto API existente, verificados antes de promover los dominios. No se instala Python dentro de Node. `SOI_SCIENCE_RPC_URL=self` usa la función de la misma versión (`VERCEL_URL`), protegida por `SOI_SCIENCE_RPC_SECRET` y una firma HMAC con vencimiento de 60 s. No se envía esa clave al navegador. `BSIE_REQUEST_WORKER=true` ejecuta y persiste los jobs dentro de una invocación acotada, sin daemon permanente.

En este modo las entradas RPC admiten hasta 4 MB y los resultados 3,8 MB; superarlos produce 413. El límite local de salida de 16 MB no amplía el límite de Vercel. Cancelar aborta la espera y protege el estado persistido; el cálculo Python remoto puede continuar hasta su límite de ejecución. La concurrencia de dos cálculos y uno por organización corresponde a cada proceso Node, sin cuota global distribuida.

### Preparar, verificar y publicar

Los proyectos Vercel existentes son `backstage-api` y `backstage-web`. No desplegar directamente las carpetas originales: el frontend importa `shared/` y la API necesita `bsie/` y `sanitary/` junto a su función Python.

1. Ejecutar `node scripts/prepare-soi-deployment.js` y `node scripts/prepare-soi-web-deployment.js`. Crean snapshots bajo `.vercel/` con manifiestos SHA-256, sin copiar `.env`, perfiles ni credenciales. El paquete API comprueba además que todos sus módulos puedan cargarse. El manifiesto Python remoto se aplana porque el builder no aceptó los includes anidados de requirements.
2. Solo para preparar el alojamiento autorizado, `node scripts/configure-soi-cloud.js --apply --cli RUTA_AL_CLI_JS`. Añade la clave RPC y ajustes necesarios; conserva MongoDB y JWT. El estado privado se guarda en `.vercel/soi-cloud-state.json`, ignorado por Git. No imprimir ni publicar ese archivo. Las claves sensibles existentes en Vercel no se pueden descargar; no se sustituyen con los placeholders que devuelve `env pull`.
3. `node scripts/deploy-soi-cloud.js RUTA_DEL_SNAPSHOT --cli RUTA_AL_CLI_JS` crea un despliegue de producción con `--skip-domain`. Guarda metadatos y logs locales. El alias interno del proyecto puede apuntar a la versión preparada; los dominios públicos se promueven explícitamente después de verificar.
4. Ejecutar `node scripts/verify-soi-cloud-science.js URL_API --cli RUTA_AL_CLI_JS`, `node backend/scripts/verify-soi-mongo-live.js --test-environment --base-url URL_API` y `node frontend/scripts/soi-browser-smoke.mjs --site-url URL_WEB`. El test persistente crea primero su tenant en la base local autorizada y exige que la API remota lo autentique antes de escribir, probando que usa esa misma base. Limpia solo sus registros. Los registros globales de auditoría de autenticación se conservan para no romper su cadena.
5. Con todos los controles aprobados, usar `vercel promote URL_API` y después `vercel promote URL_WEB` dentro del scope correcto. Validar los dominios mediante `node scripts/verify-soi-public.js`. La clave RPC nunca se incluye como argumento visible ni en el frontend.

Las tareas de auditoría usan el helper oficial [waitUntil](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package) para completar las escrituras después de enviar la respuesta, dentro del timeout de la función. La forma JSON del registro se fija antes de calcular el hash para conservarlo al serializar a BSON. Hay una prueba con el serializador BSON real.

