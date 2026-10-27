# Reglas de negocio de BACKSTAGE

La revisión conserva las reglas implementadas y distingue sus parámetros de los límites técnicos del motor. No introduce una normativa sanitaria, SLA comercial, capacidad de un vehículo o fuente territorial como si hubiera sido confirmada por el propietario. BACKSTAGE sigue siendo la plataforma; SOI es un módulo y los datos permanecen en MongoDB Atlas.

## Inventario y aplicación

| Regla | Condición y consecuencia | Implementación y verificación |
| --- | --- | --- |
| Organización y autoría | Toda lectura/mutación usa la organización y membresía vigentes; cuerpo/JWT no elevan permisos. Referencias ajenas se rechazan. | Middleware de organización, identidad Atlas y suites HTTP de Platform Core, finanzas y GIS/rutas. |
| Permisos | Administrador/analista ejecutan; consulta lee y comprueba. Configuración SOI y aprobación de propuestas corresponden a administrador. | `soiMongo.service`, `soiSanitary.service`, rutas de análisis; pruebas con rol vigente diferente del JWT y revocación. |
| Proyectos y dependencias | Comparación, probabilidad, revisión de riesgos, recomendación e informe conservan requisitos de etapa; cambios de candidatos invalidan resultados dependientes. Un vínculo GIS/financiero/logístico no completa otras etapas. | `analysis.service`, versionado de dependencias, suites de workflow. |
| Datos incompletos | No inventar métricas para obtener un ranking; políticas explícitas de ausencia y exclusión. Distinguir datos declarados, importados, simulados y fuentes no certificadas. | Comparador versionado, data resolver y suites de precisión/procedencia. |
| Moneda y periodos | Conservar moneda, unidad, periodicidad y supuestos; sin conversión o anualización implícita. | Contratos financiero y Monte Carlo; pruebas de unidades/periodos incompatibles. |
| Referencia GIS | WGS84 / OGC:CRS84, coordenadas `[longitud, latitud]` en grados. Rechazar CRS distintos; no reproyectar silenciosamente. Distancia esférica no equivale a distancia vial. | `spatialEvidence.service`; casos conocidos, antimeridiano, rangos y contención. |
| Capacidad logística | Vehículos disponibles; kg positivos y dentro de la capacidad kg registrada. Otra unidad exige fuente explícita de conversión, sin densidad asumida. | Preparación de escenarios SOI y pruebas de capacidad/unidad/fuente. |
| Matriz | Orden explícito de nodos; metros y segundos; matriz cuadrada no negativa con diagonal cero. Fuente declarada, OSRM configurado o simulación identificada. | Preparación de escenario y motor Python existente; no obtener distancias viales de segmentos rectos. |
| Restricciones | Visitas obligatorias únicas, depósitos sin demanda/servicio, tiempos de desplazamiento y servicio, ventanas, turnos y capacidad. Una carga por vehículo, sin descarga intermedia. | OR-Tools existente y comprobación independiente Node sobre la solución guardada. |
| Objetivo | Conservar pesos, escalas y penalización de omisiones. Costo requiere moneda/tarifas; emisiones requieren factores con fuente. | Normalización y validación antes de buscar; cálculos independientes del resultado. |
| Resultado de búsqueda | Diferenciar factibilidad, prueba de capacidad, inviabilidad informada por solver y ausencia de solución al agotarse el tiempo. | Estado persistido y contrato de verificación; no afirmar óptimo global ni identidad exacta de rutas. |
| Aprobación | Solo propuesta vigente puede aprobarse. Alteraciones de evidencia, coordenadas, capacidad/unidad/disponibilidad o configuración obligan a revisar/reoptimizar. | Comprobación dentro de la transacción de aprobación; tests y escenario real de configuración modificada. |
| Persistencia | Resultado, referencia al proyecto y auditoría/evento se confirman juntos. Fallos no dejan una referencia parcial exitosa. | Transacciones Atlas existentes; pruebas de fallo después de operaciones y relectura real. |

Las aprobaciones no despachan vehículos ni ejecutan acciones físicas. La planificación se etiqueta con datos aportados y sin proveedor GPS ni tráfico en vivo. Los recorridos GPS del navegador existentes conservan su propia función y consentimiento; no se presentan como una integración de flota contratada.

## Versiones y parámetros por organización

El catálogo ejecutable inicial está en `shared/spatialRules.v1.json`, versión `backstage-spatial-rules-1`, consultable en `GET /analytics/spatial-rules`. Se conserva su hash en los análisis GIS y escenarios nuevos. El catálogo documenta políticas verificadas; no es un intérprete de fórmulas arbitrarias ni un editor universal de reglas.

La configuración existente de SOI conserva sector y capacidades por organización. Cada nueva edición incrementa `revision`, guarda actor/fecha y emite `configuration.updated` con estado anterior/posterior dentro de la misma transacción. No se modifica retroactivamente una configuración histórica para asignarle revisión. Los escenarios guardan su configuración y huella; un cambio de revisión impide aprobar la propuesta anterior.

Las capacidades, ventanas, turnos, demandas, fuentes de conversión, costos, factores, pesos, escalas, prioridades y presupuesto de búsqueda son parámetros de cada escenario, recuperables y exportables. Los límites de 2–100 nodos, 1–20 vehículos y .1–15 segundos provienen del motor existente: son límites de recursos, no promesas de negocio. Los tiempos son segundos relativos al origen del escenario; no se inventa una agenda con zona horaria.

## Alcance histórico del incremento GIS del 23 de octubre

Los SLA orientativos y bandas de prioridad/salud ya existentes en `analysis.service` siguen siendo comportamiento previo de la plataforma. No se cambiaron sus valores ni se certificaron como acuerdos contractuales. La política de territorios permitidos, vigencia máxima de cada fuente, restricciones normativas por actividad, competencias de supervisores distintas del rol administrador y autorizaciones comerciales requieren definición del responsable del negocio antes de crear nuevos bloqueos automáticos.

La revisión no declara completado un gobierno de reglas de todos los módulos. El incremento aplica versionado, evidencia y controles concretos a GIS y optimización, conservando las reglas y pruebas de los módulos anteriores. [Contrato técnico y límites](SPATIAL_INTELLIGENCE_CORE.md).


## Incremento comercial del 24 de octubre: staging validado

El usuario autorizó continuar con «hazlo» e indicó al administrador como destinatario. `shared/businessRules.v1.json` define una base operativa configurable por organización. Los SLA iniciales conservan 48/24/24/72 horas por etapa y el reloj transcurrido desde la actualización del proyecto. No se creó un calendario contractual por prioridad. La vigencia inicial es 720 horas para fuentes aportadas/importadas y 24 para API externa; históricos y simulaciones conservan su clasificación.

El administrador vigente puede editar los plazos con revisión optimista y auditoría transaccional. Admin/analista registran revisiones de metadatos en un proyecto propio. Solo admin aprueba una excepción de revisión de vigencia con motivo, fuente y metadatos exactos, proyecto, hash/revisión de reglas y vencimiento; máximo inicial 24 horas, configurable hasta siete días. Las excepciones no dispensan autenticación, aislamiento, capacidad ni integridad científica. La revisión de vigencia es registrable; todavía no es un bloqueo universal de todas las aprobaciones/cierres de módulos.

APIs: `GET/PUT /operations/business-rules`, `POST /operations/business-rules/review`, `POST /operations/business-rules/exceptions`. El panel está preparado en Organización → Miembros y roles. `GET /operations/monitor` queda restringido a administradores y presenta el monitoreo técnico de staging, separado de datos de otros tenants. No hay envío de correo.

La configuración usa la organización existente; revisión/excepciones usan los proyectos y auditoría existentes. Valores nuevos no certifican fuentes, normativa sectorial ni proveedor GPS. Pasaron pruebas locales, aceptación real de la pareja final, carga acotada y reversión/restablecimiento de staging. Continúan pendientes la comprensión con una persona nueva y los cierres operativos de producción. [Informe y evidencias](READINESS_REPORT.md).
