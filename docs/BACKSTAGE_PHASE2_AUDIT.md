# BACKSTAGE · diagnóstico previo de fase 2

25 de octubre de 2026, Bogotá. Diagnóstico realizado antes de modificar ejecución. La instrucción persistente del propietario establece **MongoDB Atlas** como única persistencia. Las menciones del prompt a PostgreSQL/PostGIS no se aplican. El frontend, Mapbox y los algoritmos funcionales se conservan.

## Arquitectura y evidencia inicial

| Responsabilidad | Implementación encontrada | Verificación / carencia |
| --- | --- | --- |
| Stack y dependencias | Node 24, Express 4, driver MongoDB 6, JWT/bcrypt, Python NumPy/SciPy/Shapely/PyProj/OR-Tools; React/Vite/MapLibre y Mapbox | Sin dependencias nuevas previstas |
| API y controladores | 33 archivos de rutas, 22 controladores, 236 contratos declarados | Inventario estático; no equivale a 236 pruebas funcionales |
| Aplicación | 58 servicios; contratos y orquestación territorial existente | No existe BCO general de tareas dependientes |
| Dominio y validación | Matemáticas puras, reglas comerciales, transiciones de operaciones, contratos sanitarios, validadores específicos | DTOs distribuidos; no crear carpetas artificiales |
| Repositorios | Seis repositorios, adaptadores de activos, documentos Atlas e infraestructura transaccional | Algunas escrituras de integraciones no comprueban la pertenencia de la fuente |
| Modelos | Usuarios/organizaciones/membresías, activos, proyectos, análisis, eventos, integraciones y recursos sectoriales | IDs estables y esquema Atlas 2 conservados |
| CRUD y comandos | Altas/lecturas/ediciones/bajas donde existen; aprobar/cancelar/ejecutar son comandos | No añadir borrado arbitrario a evidencias inmutables |
| Autenticación | JWT, hashes existentes, recuperación preparada y sesiones revocables | Correo real sin configurar; no modifica este diagnóstico |
| Autorización | admin/analyst/viewer, organización vigente, control del último administrador, validaciones específicas | Formalizar RBAC + atributos para los nuevos recursos; no crear roles ficticios |
| Algoritmos | Comparación, finanzas, riesgos, Monte Carlo, GIS, probabilidad, BSIE y OR-Tools sanitarios | No se encontraron GWO/ACO/SSA/RBF/genéticos; no declararlos disponibles |
| Trabajos | analytics_jobs registra ejecuciones; bsie_jobs tiene cola/leases y worker CLI | Analítica heredada síncrona; BCO debe ejecutar fuera de la petición HTTP |
| Eventos | Eventos operacionales persistidos y bus local WebSocket | La publicación inmediata carece de outbox general; un bus local no conecta procesos remotos |
| Percepción | Ingestión GeoJSON, catálogos/capas, OSM/Open-Meteo, flotas con consentimiento y retención | No hay proveedor GPS contratado; Sentinel/Landsat/STAC no se declaran conectados |
| Observabilidad | Correlation ID, cabeceras, logs sin cuerpos, healthchecks, monitor y supervisor | Monitor de staging depende del equipo local; no existe worker BCO administrado |
| Seguridad | Rate limiting Atlas, aislamiento, auditoría con cadena, timeouts y fuente remota restringida | Falta evaluación defensiva controlada y protección del nuevo runtime |
| Pruebas | Regresión inicial: 355, 354 aprobadas, una externa omitida | Resultado ejecutado, no inferido del código |
| Riesgos | Repositorio con abundantes cambios anteriores sin commit; dos colas parciales; procesos serverless efímeros | No reset, migraciones destructivas ni cambios de producción |
| Fortalecimiento | BCO, contratos ejecutables, políticas por recurso, outbox, percepción acotada y defensa sin aplicación autónoma | Desarrollo incremental con regresiones y ensayo propio Atlas |

[Inventario de capas y rutas](evidence/phase2-architecture-inventory.json). Copia previa de 502 archivos: `.vercel/phase2-before-20261025T164829Z/source.zip`, SHA-256 `2a1e9836ddf7625890c941194309927dedeac051ceb416f4f4fea6d79026ea43`. Contiene código, no credenciales ni respaldo Atlas.

## Decisiones antes de implementar

1. Componer las capacidades existentes mediante adaptadores, manteniendo contratos heredados.
2. Persistir las ejecuciones BCO en `analytics_jobs`, con discriminador y eventos en `operational_events`; no añadir otra base ni un broker.
3. Usar creación idempotente, revisión optimista, leases con propietario y límites globales/por organización. El worker CLI ejecuta trabajos; la API únicamente los registra/consulta/comanda.
4. Aislar algoritmos JavaScript en worker threads y conservar el runner Python existente. Catálogo cerrado, límites y procedencia; nunca ejecutar código aportado por clientes.
5. Formalizar permisos por rol, organización, autor y estado. Los workers vuelven a comprobar autorización vigente.
6. Añadir percepción sobre datos aportados explícitamente y conectores ya existentes. La salida cartográfica se entrega como GeoJSON a las API y al explorador existente, sin segundo mapa.
7. Evaluar defensas con observaciones etiquetadas y separación de entrenamiento/validación. Propuestas y aprobación humana, sin modificar automáticamente roles, claves, infraestructura o políticas sensibles.
8. Documentar OpenAPI, matriz de permisos y límites operativos; pruebas unitarias, HTTP, concurrencia y Atlas de pruebas antes de declarar resultados.
