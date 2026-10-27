# SOI con MongoDB Atlas: persistencia exclusiva


La conexión configurada fue confirmada por el usuario como **entorno de pruebas**. Se corrigió la resolución SRV con `MONGODB_DNS_SERVERS`, sin cambiar DNS del sistema ni TLS. El esquema v2 está aplicado sin eliminar registros. Atlas pasó 17 comprobaciones reales con limpieza de la organización temporal, incluidos transacciones, Python, persistencia sanitaria y eliminación TTL observada. Evidencia: [soi-mongo-live.json](evidence/soi-mongo-live.json).

La API utiliza MongoDB Atlas en todos sus servicios persistentes. Se retiraron los adaptadores alternativos, sus dependencias y las instrucciones de instalación anteriores. Las colecciones nativas incluyen ubicaciones, riesgos, valoraciones, análisis, eventos, integraciones y el motor territorial. Los archivos retirados se preservaron en una copia local ignorada antes de sustituirlos.

## Cuatro líneas de trabajo

1. **Persistencia MongoDB.** Cliente compartido, colecciones/indexes explícitos, contadores con IDs públicos numéricos, aislamiento por organización, transacciones Atlas/replica set y ausencia de almacenamiento simulado en runtime SOI. Registro/login/membresías/usuarios y auditoría encadenada también tienen adaptador MongoDB exclusivo. Un admin no puede apropiarse de una cuenta global de otra organización.
2. **Cuadrillas y órdenes.** Capacidades configurables `crews` y `service_orders`; miembros de cuadrilla validados contra la organización actual; órdenes con activos, operación, cuadrilla, plan vial y vencimiento opcionales. Estados planned → assigned → in_progress → completed, con cancelación válida; una orden asignada requiere cuadrilla activa. Se conserva el vínculo transaccional operación/activos.
3. **Flujo integrado y verificación.** Centro de operaciones y portafolio principal usan SOI. Comparador, Explorador y AirHeart consultan activos SOI; los paneles heredados continúan accesibles. Las pruebas aisladas se complementan con verificación HTTP sobre Atlas real: identidad, activos, cuadrillas, órdenes, importaciones, BSIE y nuevos dominios sanitarios.
4. **GPS/flota.** El usuario confirmó que todavía no hay proveedor. Se implementó el contrato de fuentes autorizadas e ingestión de posiciones con consentimiento, IDs de eventos idempotentes, tenant, precisión, timestamps, saltos, revocación y retención. El mapa distingue transmisión reciente, antigua o ausente. No se inventa un proveedor, vehículo conectado o señal real. El GPS del navegador corresponde al usuario y no se atribuye automáticamente a un vehículo. Sin prueba de dispositivo físico.

El documento posterior agrega BSIE al mismo stack: validación, pesos, autocorrelación, hotspots, densidad, OLS y análisis por períodos. Consulte [BSIE.md](BSIE.md), y [API sanitaria](SOI_SANITARY_API.md) para los dominios nuevos.

## Configuración y esquema


Desde la raíz:

```powershell
npm run mongo:plan --prefix backend
npm run mongo:inspect --prefix backend
npm run mongo:init --prefix backend
npm run dev
```


Colecciones: `identity_*`; `soi_configuration`, `soi_assets`, `soi_operations`, `soi_crews`, `soi_service_orders`, `soi_vehicles`, `soi_incidents`, `soi_imports`, `soi_comparisons`, `soi_route_plans`, `soi_trips`, `soi_trip_points`, `soi_fleet_sources`, `soi_vehicle_positions`, `soi_audit_events`, `soi_audit_heads`, `soi_provider_locks`, `soi_counters`; `bsie_jobs` y `bsie_weights`. Índice 2dsphere en activos. TTL en viajes/posiciones y trabajos/cachés. Unicidad de IDs externos por organización y de eventos por vehículo/fuente. Transacciones reales requieren Atlas o replica set; no se sustituyen por confirmaciones parciales en un servidor standalone.

## APIs y fuentes

Se conserva el prefijo `/soi` con catálogo/configuración/resumen, activos, operaciones, vehículos, incidencias, importaciones y comparaciones. Nuevos recursos: `/soi/crews`, `/soi/service-orders`, `/soi/fleet/sources`, `/soi/fleet/status`, `/soi/fleet/vehicles/:id/positions`. Las rutas consultan la membresía vigente y sus capacidades; los vínculos con recursos de otra organización se rechazan.

Fuentes de datos distinguen `ORGANIZATION_PROVIDED`, `IMPORTED`, `EXTERNAL_API`, histórico/demo y desconocido. Ingresar o editar un dato no lo convierte en `REAL_VERIFIED`. Los indicadores separan inventario de procedencia operacional. Un fallo de DEM, ruta o proveedor no se sustituye por evidencia inventada.

Los planes viales se guardan en MongoDB y la búsqueda Nominatim comparte un lease/cooldown MongoDB. Se conservaron las verificaciones externas anteriores: ruta OSRM Miami–Los Ángeles y superficie Copernicus GLO-90, documentadas en [SOI_GEO.md](SOI_GEO.md). Esas verificaciones externas no acreditan persistencia de Atlas ni tráfico en vivo.

## Pruebas y límites

Regresión actual: **249 pruebas backend aprobadas y una integración externa optativa omitida; 13 frontend, 27 BSIE, 11 sanitarias y seis probabilísticas aprobadas**. Los adaptadores `domain/helpers/*` son exclusivamente de prueba. Evidencia: `docs/evidence/soi-release-checks.json`; benchmarks BSIE y sanitario en la misma carpeta. Las 15 comprobaciones de navegador usan fixtures explícitas y no acreditan conexiones con proveedores.


Detalles: [Identidad MongoDB](SOI_MONGODB_IDENTITY.md), [GPS y flota](SOI_MONGO_GPS_FLEET.md), [BSIE](BSIE.md).

## Verificación de la persistencia exclusiva en Atlas

La corrección del 21 de octubre retiró el controlador alternativo, los adaptadores de pruebas anteriores, los esquemas, los comandos de migración y las condiciones que seleccionaban otra base de datos. El arranque, `/health`, los repositorios, la interfaz, las guías y CI utilizan MongoDB Atlas.

Pasaron 249 pruebas backend (una integración externa optativa omitida), 13 pruebas frontend, la compilación y 15 comprobaciones de navegador. La prueba real de los módulos convertidos pasó diez comprobaciones con una organización temporal: índices aditivos, ubicaciones, riesgos/componentes, valoraciones, análisis transaccional, recomendaciones, eventos, motor territorial, integraciones y resumen. Evidencia: [soi-atlas-only-live.json](evidence/soi-atlas-only-live.json). Solo se eliminaron los registros de esa organización de verificación.

`backend/scripts/verify-soi-atlas-only.js --test-environment` permite repetir esa comprobación en un Atlas de pruebas autorizado. La evidencia de publicación se actualiza después de verificar el despliegue.

La corrección se publicó y verificó en ambos dominios. La API pública responde `primaryStore=mongodb`, `mongodb=healthy` y `spatialStore=atlas`. Los 17 controles remotos, seis controles científicos, 15 de interfaz desplegada y cinco comprobaciones públicas pasaron. Recibo: [soi-deployment.json](evidence/soi-deployment.json).
