# GIS y optimización: contrato de trazabilidad

El incremento utiliza motores existentes: Haversine y ray casting de `backend/spatial/core.js`, y CVRP/VRPTW de `sanitary/routing.py` con OR-Tools. No reemplaza esos algoritmos ni el proveedor de rutas OSRM existente. Conserva MongoDB Atlas, colecciones e IDs; no crea índices ni cambia la versión de esquema.

## GIS reproducible

`POST /analytics/gis` acepta `algorithm: "distance_matrix"` o `"point_in_polygon"`, `source:{name,data_type}` y opcionalmente `analysis_run_id`. La primera operación admite 2–100 coordenadas; la segunda, un punto y anillo cerrado de 4–1000 posiciones. Solo se admite OGC:CRS84, WGS84, orden longitud-latitud y grados; no hay reproyección. Es la convención de [GeoJSON, RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html).

El servidor calcula y conserva entradas, resultado y `backstage-analysis-1` en `analytics_jobs`, versión `backstage-gis-core-1`. Guarda huellas de datos, resultado, código, reglas, referencia y runtime. El vínculo al proyecto, resultado y hecho de auditoría se confirman en la misma transacción. Se reutilizan `GET /analytics/jobs/:id/reproducibility`, `/export` e historial por proyecto. Una comprobación no modifica el snapshot.

La matriz es distancia esférica con radio existente 6371008.8 m, redondeada a seis decimales; no es una matriz vial, tiempo de viaje ni precisión topográfica certificada. La contención usa un solo anillo planar: informa frontera por separado y la excluye del interior, con tolerancia angular cuadrada 1e-12. Rechaza anillos abiertos o que crucen el antimeridiano; no certifica topología, autointersecciones ni polígonos con huecos. La clasificación aportada `REAL_VERIFIED` no crea una certificación.

La interfaz añade un panel en el comparador existente, con entradas propias sin ejemplos operativos precargados, fuente, reglas, historial, comprobación y descarga. No sustituye Explorer, los comparadores previos ni sus resultados.

## Optimización sobre el escenario existente

`POST /soi/sanitary/optimization` conserva la selección de activos/vehículos reales de la organización y capacidad habilitada. Materializa los parámetros por defecto del motor antes de ejecutarlo: demanda, servicio, ventanas, turnos, depósitos, prioridades, objetivo, escalas, horizonte y presupuesto de búsqueda. Los snapshots conservan coordenadas, fuente, capacidad/unidad/disponibilidad registradas, configuración de negocio y matriz completa. La matriz congelada permite repetir sin consultar otra vez al proveedor vial.

Los registros permanecen en `soi_optimization_scenarios`; `analysis` añade `backstage-route-evidence-1` al resultado `soi-scientific-1.0.0`. Preserva fuente/código, versiones, matriz, restricciones, unidades, reglas y sus huellas. Demanda/capacidad se cuantizan a gramos con empate al par, desplazamiento/servicio se redondean hacia arriba a segundos, ventanas/turnos hacia abajo y presupuesto a milisegundos. La escala entera del objetivo existente es 1000000.

`analysis_run_id` opcional enlaza el escenario a `analysis_runs.metadata.spatial_evidence`. Se confirma junto con resultado y evento de dominio. Un escenario repetido en el mismo contexto recupera su identidad; una revisión/configuración posterior no sobrescribe las entradas de otro análisis. Los reintentos conservan revisión, límite de intentos y cancelación anteriores; los históricos sin contrato siguen leyéndose sin huellas retroactivas.

| Ruta | Conducta |
| --- | --- |
| `GET /soi/sanitary/optimization/:id/reproducibility` | Integridad y comprobación matemática independiente del resultado conservado; no ejecuta otra búsqueda ni consulta matrices externas. |
| `GET /soi/sanitary/optimization/:id/export` | Descarga `{format:"backstage-optimization-export-1",snapshot,verification}`. |
| `POST /soi/sanitary/optimization/:id/reproduce` | Admin/analista, capacidad vigente y evidencia verificable. Repite las entradas congeladas y devuelve resultado nuevo y comparación, conservando intacto el escenario original; registra el hecho de reproducción. |
| `POST /soi/sanitary/optimization/:id/approve` | Administrador, propuesta vigente, evidencia/solución válidas y recursos/configuración aún compatibles. |

La comprobación independiente recalcula visitas obligatorias, duplicados, depósitos, tiempos/servicio, capacidad, ventanas/turnos, distancia, costo/emisiones disponibles, omisiones y objetivo normalizado. Para `INFEASIBLE_CAPACITY` vuelve a comprobar la desigualdad de capacidad; para otros estados conserva la conclusión del solver sin afirmar una demostración independiente inexistente.

La búsqueda utiliza PATH_CHEAPEST_ARC y GUIDED_LOCAL_SEARCH con tiempo acotado del motor actual. No expone una semilla configurable ni garantiza el mismo orden de visitas entre ejecuciones. La repetición informa coincidencia exacta y validez del resultado por separado. No se afirma optimalidad si no la informa el solver; agotar tiempo sin solución no equivale a inviabilidad. Referencia: [opciones y estados de OR-Tools](https://developers.google.com/optimization/routing/routing_options).

Las huellas del resultado omiten únicamente `duration_ms`, que mide tiempo de procesamiento; `duration_s` de las rutas y todos los demás resultados permanecen comprobados. SHA-256 no es firma digital ni prueba de autenticidad de una fuente que alguien pueda reescribir con sus huellas fuera de la aplicación. Los controles de acceso, auditoría y revisión son independientes.

## Reglas y acceso

[Inventario de negocio](BUSINESS_RULES.md), catálogo `backstage-spatial-rules-1`, configuración SOI con revisión/actor/auditoría y parámetros efectivos en cada escenario. Un cambio de configuración o eliminación del contrato de un escenario nuevo impide su aprobación. Las fuentes declaradas y matrices simuladas conservan su naturaleza. Sin proveedor GPS, el contexto es `planning_with_supplied_data`; no se afirma seguimiento vehicular real.

Lecturas/comprobación/exportación admiten admin, analista y consulta con membresía vigente y capacidad correspondiente. Calcular/repetir requieren admin/analista; aprobar/configurar requieren admin. Recurso de otra organización con capacidad habilitada: 404; rol/membresía insuficientes: 403; capacidad deshabilitada o revisión/configuración incompatible: 409. Las rutas anteriores y registros históricos se conservan. Finanzas y Monte Carlo conservan sus motores, archivos de huella y contratos anteriores.

El incremento no certifica todas las operaciones GIS de la plataforma, acceso vial a partir de distancia esférica, un proveedor externo operativo, normativa sanitaria ni preparación completa de producción. Esos alcances permanecen explícitos en la hoja de ruta.
