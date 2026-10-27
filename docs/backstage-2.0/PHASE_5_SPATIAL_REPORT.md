# Fase 5 — Reglas de negocio, GIS y optimización de rutas

Cierre del incremento: 23 de octubre de 2026, hora de Bogotá. Alcance aprobado: revisar reglas existentes y extender la trazabilidad GIS/rutas conservando motores, identidad de BACKSTAGE y MongoDB Atlas. No se publicó en producción.

## Resultado disponible en staging

[BACKSTAGE staging](https://backstage-staging-web.vercel.app), protegido por Vercel y sesión de BACKSTAGE, con Atlas de pruebas. Enlaces estables actualizados a los Preview finales:

| Servicio | Despliegue validado |
| --- | --- |
| API | `dpl_CaecTh5V5RJLoAnYvmcxkcpxLXV9` |
| Web | `dpl_H6WVviGNj6QXG87kaKmnHvjFpBd7` |

[Despliegues](evidence/phase-5-spatial-deployment.json), [integración real](evidence/phase-5-spatial-live.json), [postflight independiente](evidence/phase-5-spatial-postflight.json).

## Reglas y comportamiento entregado

El [inventario de reglas](BUSINESS_RULES.md) relaciona condiciones, consecuencias, código y verificación. Se conservan organización/membresía vigente, roles, dependencias de proyectos, datos incompletos y procedencia. El catálogo espacial `backstage-spatial-rules-1` queda asociado por versión y huella a cada análisis nuevo. No se inventan SLA comerciales, normativas sanitarias o umbrales operativos pendientes de ratificación.

Las nuevas ediciones de configuración SOI conservan revisión, actor y auditoría transaccional de antes/después. Preparar o aprobar escenarios bloquea la referencia de configuración dentro de la transacción para detectar cambios concurrentes. Cambiar configuración, capacidad/unidad/disponibilidad, coordenadas o evidencia impide aprobar una propuesta nueva desactualizada. Aprobar sigue siendo atribución del administrador; no despacha una operación física.

GIS añade dos operaciones en los jobs existentes: matriz de distancias esféricas y contención de punto en un anillo planar. Conserva coordenadas, WGS84/CRS84, orden longitud-latitud, unidades, fuente, código, reglas, resultado y huellas. La interfaz se integra en el comparador existente con historial, comprobación y exportación por proyecto. No sustituye Explorer ni presenta distancias esféricas como rutas viales.

Optimización conserva el escenario SOI y el motor CVRP/VRPTW Python/OR-Tools. Guarda la matriz completa, recursos, demandas, capacidades, ventanas, turnos, objetivos, prioridades, costos/factores cuando existen, parámetros efectivos, reglas y su configuración. Añade comprobación independiente, descarga y repetición con entradas congeladas. Cada repetición tiene evento propio, huella de resultado y versión del solver; conserva intacto el escenario original y permite repetir más de una vez.

La búsqueda acotada puede devolver otra ruta válida. El informe distingue coincidencia exacta, factibilidad y ausencia de prueba de optimalidad. La capacidad insuficiente se comprueba; una búsqueda sin solución al agotarse el tiempo no se transforma en inviabilidad demostrada. Sin proveedor GPS, se etiqueta planificación con datos aportados y sin tráfico en vivo.

El vínculo GIS o logístico al proyecto se confirma junto con resultado y auditoría/evento en Atlas. Se mantienen colecciones, IDs e índices actuales, esquema 2, sin migración física. Finanzas, Monte Carlo, comparación y workflow mantienen sus motores/archivos de contrato anteriores. [Contrato y API completos](SPATIAL_INTELLIGENCE_CORE.md).

## Validación y evidencia

| Comprobación | Resultado |
| --- | --- |
| Backend | 312 pruebas aprobadas; una integración externa omitida, sin fallos |
| Frontend | 26 aprobadas |
| BSIE / sanitario / transporte científico / probabilidad | 27 / 11 / 1 / 6 aprobadas |
| Nuevos casos GIS/reglas/rutas | 13, incluidos en el total backend; con motor Python real y comprobación independiente |
| Navegador con fixtures | 66 comprobaciones, 35 vistas, cero errores de ejecución |
| Build | Vite, 137 módulos; Preview API/web listos |
| Paquetes | 234 archivos API y 147 web comprobados por manifiesto |
| Revisión de fuentes | 17 archivos de aplicación coinciden con paquetes finales; 23 fuentes preservadas sin cambios |
| Integración real | 18 grupos aprobados, 160 respuestas API observadas, cero excepciones del navegador; sin interceptar APIs |
| Capturas reales | 16, incluidos GIS y evidencia logística en 390/1440 px |

[Regresiones](evidence/phase-5-spatial-regression.json), [navegador aislado](evidence/phase-5-spatial-browser.json), [paquetes](evidence/phase-5-spatial-packaging.json), [fuentes y preservación](evidence/phase-5-spatial-source-review.json).

La prueba real verificó distancia ecuatorial de 111195.080234 m, su referencia y reproducción, con datos aportados. Cargó un archivo de matriz simulado mediante el formulario logístico; el recorrido conocido produjo 2000 m y carga 5/10 kg. Repitió la búsqueda dos veces con eventos únicos, comprobó el registro original intacto, exportó evidencia y confirmó el vínculo al proyecto. Demanda 11 kg frente a capacidad 10 produjo `INFEASIBLE`; aprobar ese escenario se rechazó. Una edición posterior de configuración aumentó su revisión a 2 e impidió aprobar la propuesta anterior.

También pasaron lectura de consulta, rechazo de ejecución/repetición por ese rol, aislamiento de organizaciones, revocación, históricos válidos/inválidos del comparador, finanzas y Monte Carlo anteriores, auditoría completa de 58 eventos en la comprobación y transporte Node/Python protegido. Se conserva sondeo HTTP en ese hosting. Coordenadas del dispositivo emuladas: no son GPS físico.

Los intentos previos detectaron problemas del verificador: espera que confundía ID de proyecto/ejecución y navegación que asumía otro control de dominio. Se corrigió para esperar el botón exacto y usar el selector real. Todos esos intentos respaldaron y retiraron sus datos. Sus informes privados se conservan; no se relajaron controles de la aplicación para aprobar la prueba.

## Datos, preservación y reversión

Ejecución final: `atlas-core-20261024033020-dca8c3257a1d`, 03:30:20–03:31:58 UTC del 24/10 (noche del 23/10 en Bogotá). El respaldo y limpieza cubren solo las dos organizaciones de ensayo y sus registros, incluidos configuración, activos/vehículos SOI, escenarios, eventos, proyectos y jobs. Los contadores compartidos y trazas globales de seguridad/cadena hash se conservan. El postflight iniciado a las 03:32:25 UTC confirmó cero filas de los tenants de ensayo en las nueve colecciones principales y 58 colecciones registradas adicionales, incluidos todos los intentos de este incremento. También verificó aliases, protección, salud MongoDB y propagación del ID de solicitud.

Respaldo BSON acotado: `.vercel/staging-atlas-core-20261024033020-dca8c3257a1d/owned-test-records.bson`; SHA-256 `2c1e4e8320925cb4a092161dccec2319044e7715395a1f6b864b35f98a16639b`. No es un respaldo completo de Atlas ni PITR.

Fuente previa: `.vercel/backstage-spatial-rules-20261024T030337Z/source.zip`, 985 archivos, lectura y hashes comprobados; SHA-256 `abc4035b869f094ae7bcaeb5891382f7961507d8d3a5f3c67eb222f923bbd88d`. El puntero privado es `.vercel/backstage-spatial-rules-latest.json`. Se comprobaron sin cambios motores Python/GIS originales, App, estilos y entrada orbital, conexión/esquema Atlas y archivos que determinan huellas financieras y de comparación.

Los Preview anteriores funcionales son API `dpl_DXs7G6SUpsq7HXJJAeXGwwD4L4ki` y web `dpl_FgZ9NBxRZAsfRiotLkjDCjW6mdzU`. No se ejecutó reversión ni promoción a producción. Restaurar código no elimina análisis nuevos; conservar lectura de versiones y revisar fragmentos selectivamente, sin reset o sobrescritura global del árbol de trabajo.

Quedan preparación de producción (respaldo completo/restauración aislada de Atlas, observabilidad y reversión), ratificación de reglas comerciales pendientes y cobertura de otras operaciones GIS. El incremento no declara completado el gobierno de reglas de todos los módulos ni contratado un proveedor GPS.
