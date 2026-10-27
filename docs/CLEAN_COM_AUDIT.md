# Clean Com 0.1: auditoría de Proyecto_grado.gdb

Fecha de implementación: 13 de octubre de 2026. La fecha de procesamiento no implica actualización operativa de los datos.

## Alcance y trazabilidad

Se inspeccionó Backstage antes de implementar el módulo. Solo existía la geodatabase dentro de frontend/cleancom; no había página ni API de Clean Com. La versión 0.1 incorpora un worker geoespacial independiente, repositorio de artefactos, servicio, controlador, rutas internas y página integrada con la sesión, roles, organización activa y navegación existentes. No se modificó la lógica de los otros módulos para efectuar estos análisis.

La fuente original se abrió en modo de lectura. Contiene **162 archivos y 392.780.687 bytes**. La huella anterior y posterior al procesamiento coincidió:

`73fa2f3434a7c8aaa6646171b40f519e3001c2f03d0ad244750da8e03ec742e7`

Auditoría completa: **21 capas/tablas y 1.376.860 registros agregados de origen**. Esta suma incluye tablas derivadas y capas fusionadas; no representa operaciones únicas. El informe máquina está en backend/cleancom/data/empresas-varias-2025/audit.json, generado fuera de Git y disponible mediante la API autenticada.

Por instrucción del usuario, el primer caso es una referencia compartida de desarrollo (shared_authenticated). Cualquier usuario de Backstage con sesión, organización activa y rol admin, analyst o viewer puede consultarlo. No se exige harmony ni una ubicación particular. Los futuros estudios privados pueden vincularse por ID de organización y mantienen su aislamiento. El alcance compartido no declara una licencia abierta: la fuente no suministró licencia de redistribución. La geodatabase original no se publica ni se incorpora a los archivos estáticos del frontend.

## Inventario observado

| Capa o tabla | Registros auditados | Geometría declarada | Geometrías en la vista |
| --- | ---: | --- | ---: |
| Zona_1_2024 | 1.537 | MultiLineString | 765 |
| Zona_2_2024 | 2.567 | MultiLineString | 852 |
| Zona_3_2025 | 839 | MultiLineString | 839 |
| Zona_4_2026 | 1.805 | MultiLineString | 899 |
| Zona_5_2015 | 431 | MultiLineString | 430 |
| Zona_6_2024 | 1.926 | MultiLineString | 963 |
| Zona_7_AM_2024 | 528 | MultiLineString | 528 |
| Zona_7_NOCHE_2018 | 148 | MultiLineString | 148 |
| Zona_7_PM_2023 | 242 | MultiLineString | 242 |
| Zonas_Merge | 10.023 | MultiLineString | 912 |
| Tickets_Ruta | 87.438 | Tabla sin geometría | 0 |
| Tickets_Ruta_Statistics | 83.835 | Tabla sin geometría | 0 |
| Tickets_Ruta_Statistics1 | 598 | Tabla sin geometría | 0 |
| z1 | 113 | MultiPolygon | 113 |
| Z2 | 114 | MultiPolygon | 114 |
| z3 | 69 | MultiPolygon | 68 |
| Z4 | 79 | MultiPolygon | 79 |
| Z5 | 32 | MultiPolygon | 32 |
| Z6t | 79 | MultiPolygon | 77 |
| Z7 | 16 | MultiPolygon | 16 |
| Instalaciones | 1.184.441 | Point | 1.000 |

Las vistas usan posiciones sistemáticas de registros, hasta 1.000 por capa, excluyendo geometrías vacías o inválidas. No constituyen una muestra estadística. No se simplifican ni reparan las geometrías originales. Las direcciones, identificadores catastrales, comentarios y placas no se incluyen en los atributos geográficos publicados.

## Periodos y variables

La tabla base Tickets_Ruta contiene **87.438 registros**, con fechas de **2025-01-01 a 2026-03-10**: **73.144 en 2025** y **14.294 en 2026**. Fecha tiene granularidad de día; no proporciona hora ni zona horaria. No hay geometría propia del ticket. Las tablas Tickets_Ruta_Statistics y Tickets_Ruta_Statistics1 son derivadas y no se suman a los indicadores de la tabla base.

Los nombres de rutas incluyen años 2015, 2018, 2023, 2024, 2025 y 2026. Un año en el nombre es una pista no verificada, no evidencia de vigencia durante 2025. Los polígonos de zona contienen códigos, denominaciones y campos de planificación; nombres como TON_TEORIC o TON_1ERA_F no bastan para validar significado, unidad y periodo.

En Tickets_Ruta se observaron Fecha, Nº_Ticket, Vehículo, Tipo_de_servicio, Estado_del_Servicio, N__de_Servicio, Lugar_de_Descarga, Comuna, Ruta, Valor y Comentario. **Valor carece de unidad y significado documentados**: no se interpreta como kg, toneladas, dinero o producción. El informe conserva el inventario, tipo, completitud, cardinalidad, rangos y periodos por atributo; los valores distintos no seleccionados para conteo exacto se señalan como límite inferior cuando corresponde.

## Descripciones verificables de 2025

| Descripción | Resultado | Límite de interpretación |
| --- | ---: | --- |
| Registros de tickets | 73.144 | No equivalen automáticamente a viajes únicos. |
| Identificadores de vehículo con tickets | 164 | No representan flota disponible, capacidad o utilización. |
| Códigos de ruta en tickets | 592 | Se preservan prefijos y ceros iniciales. |
| Códigos con geometría válida en Zonas_Merge | 506 | No prueba vigencia ni recorridos observados. |
| Tickets con coincidencia de código | 59.628 | Vínculo por atributo; no localización observada del ticket. |
| Tickets sin coincidencia de código | 13.516 | Exigen diccionario o tabla de correspondencias validada. |
| Tickets sin código de ruta en 2025 | 0 | No elimina los problemas de correspondencia. |
| Filas de atributos idénticas en Tickets_Ruta, todos los periodos | 0 | No certifica ausencia de duplicación semántica. |

La unión normaliza espacios externos y mayúsculas, conservando ceros iniciales. No elimina prefijos N/T ni asigna códigos por semejanza. Los recuentos mensuales corresponden exclusivamente a 2025. Las frecuencias por comuna, servicio y estado disponibles en la auditoría se etiquetan como todos los periodos de la tabla.

## Geometrías y referencia espacial

- Zonas_Merge: 31 geometrías vacías, 78 repeticiones WKB exactas; no se suman otra vez las incidencias correspondientes en las capas de origen.
- z3: un polígono inválido. Z6t: dos polígonos inválidos. Se excluyen de las vistas; no se reparan automáticamente.
- Instalaciones: 1.184.441 puntos válidos, sin vacíos o nulos. Se detectan 613.342 repeticiones WKB exactas. Pueden corresponder a instalaciones diferentes en una misma posición; no se eliminan ni se califican automáticamente como errores.
- Rutas y zonas: CRS local PCS_MAG_Ant_Medellin, sin EPSG identificable. La transformación a WGS84 es aproximada (ballpark), sin precisión conocida. La interfaz lo advierte. No se certifican distancias o áreas métricas a partir de esta transformación.
- Instalaciones: MAGNA-SIRGAS (EPSG:4686), transformación a WGS84 con precisión nominal de 1 m. La precisión de adquisición de los puntos sigue sin documentarse.

## Análisis por versiones

**V0.1 entregada:** auditoría completa, visualización de geometrías reales, calidad por atributo/capa, periodos observados, recuentos de 2025, correspondencia de códigos, trazabilidad y exportación de auditoría. Las APIs paginan la vista con comprobación de integridad y se reutiliza la navegación hacia el Explorador.

**V0.2:** incorporar diccionario de datos, correspondencias y vigencia verificadas. Procesar el conjunto completo para distribución territorial y geoestadística: definir variable, unidad, soporte temporal/espacial, vecindad, tratamiento justificado de repeticiones y validación. No calcular densidades o interpolaciones a partir de la vista limitada. Nuevos operadores y territorios usan otro contrato de caso y paquete procesado, con alcance compartido o privado explícito.

**V0.3:** evaluación logística únicamente con masa medida, distancias realmente recorridas, horas observadas, capacidad y disponibilidad de vehículos y vínculos de viaje/servicio validados para el mismo periodo. Hasta entonces la interfaz marca **eficiencia no evaluable** y no calcula puntuaciones, ahorros ni conclusiones de optimización.

## Contratos y verificación

Consultar [arquitectura, APIs y reproducción](../cleancom/README.md) y [contrato del caso](../cleancom/contracts/case.schema.json). No hay nuevas migraciones SQL en esta versión.

Pruebas del procesador cubren fechas, valores ausentes/no finitos, ceros iniciales, unión solo con geometría válida, exclusión sin reparación y huella de fuente. Las pruebas HTTP ejercitan JWT, roles, acceso compartido entre organizaciones, aislamiento de casos privados incluso después de caché, límites geográficos/paginación e integridad de artefactos. El navegador usa los artefactos reales de esta geodatabase, APIs HTTP y sesión local: sin respuestas ficticias del módulo, con anchos 1440, 390 y 320 px en ambas carpetas.

## Publicación verificada

El 13 de octubre de 2026 se publicaron frontend y backend en https://backstage-web-seven.vercel.app y https://backstage-api.vercel.app. Clean Com aparece en el menú de Operación. El caso de referencia es compartido entre organizaciones autenticadas. MongoDB Atlas 17 y Atlas respondieron saludables; las APIs exigen sesión (401 anónimo) y las rutas de artefactos internos responden 404. La geodatabase no se sirve desde el frontend.

Validación: 175 pruebas backend de la carpeta principal, 140 de la carpeta IDE, cuatro del procesador, 18 comprobaciones de navegador con datos reales en ambas carpetas y 12 comprobaciones de lectura en producción. Ambos frontends compilan. El flujo autenticado se verificó localmente con sesión y APIs reales; no se probó una sesión de usuario existente en producción porque no se dispuso de sus credenciales. No se crearon cuentas diagnósticas en producción. Informe local: .vercel/cleancom-release-report.json.
