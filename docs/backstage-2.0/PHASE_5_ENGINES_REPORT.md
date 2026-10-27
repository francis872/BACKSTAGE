# Fase 5 — Finanzas y simulación probabilística

> Informe del incremento financiero/probabilístico. La extensión posterior de reglas, GIS y optimización está en [el informe espacial](PHASE_5_SPATIAL_REPORT.md). Los IDs y evidencias de este informe se conservan como historial.

Cierre: 23 de octubre de 2026, hora de Bogotá. Incremento aprobado con «hazlo» sobre la propuesta de extender Intelligence Core a los motores financiero y probabilístico y validarlos en Atlas de pruebas/staging. El [contrato de comparación anterior](PHASE_5_REPORT.md) sigue vigente; no se declara terminada toda la Fase 5.

## Resultado disponible

Publicado y validado en [BACKSTAGE staging](https://backstage-staging-web.vercel.app), protegido por acceso de equipo Vercel y luego por la sesión BACKSTAGE. Persistencia exclusiva en MongoDB Atlas de pruebas, mismo esquema 2, IDs y colecciones. Sin migraciones ni índices nuevos. Los proyectos, dominios y destinos originales de producción se comprobaron sin cambios.

| Servicio Preview | Despliegue final |
| --- | --- |
| API `backstage-staging-api` | `dpl_DXs7G6SUpsq7HXJJAeXGwwD4L4ki` |
| Web `backstage-staging-web` | `dpl_FgZ9NBxRZAsfRiotLkjDCjW6mdzU` |

Los enlaces estables de staging apuntan a esos despliegues. El frontend usa su API Preview específica. [Evidencia de despliegue](evidence/phase-5-engines-deployment.json), [comprobación independiente posterior](evidence/phase-5-engines-postflight.json).

## Cambios entregados

- Finanzas: nueva versión `backstage-financial-2`, con importes y tasas decimales canónicos, cálculo racional de VPN/DCF/capitalización/payback, salidas monetarias `_decimal`, periodicidad explícita y TIR acotada sin convergencia ficticia. El motor `1.0.0` permanece intacto para lectura/repetición histórica.
- Monte Carlo: nueva versión `backstage-monte-carlo-2` sobre el generador existente; modelo de normales independientes y suma ponderada. Guarda factores, pesos, unidad, procedencia, semilla, iteraciones y orden canónico de factores. No convierte percentiles simulados en intervalos de confianza.
- Evidencia: contrato del servidor, huellas de entradas/resultado/fuentes/manifiesto y entorno. Comprobación y descarga JSON del registro conservado, sin modificarlo.
- Proyectos: referencia a la ejecución en `analysis_runs`, con resultado, vínculo y auditoría atómicos. Historial filtrable por proyecto y organización; lectura/exportación para consulta, ejecución para administrador/analista, revocación y aislamiento aplicados por el servidor.
- Interfaz: formulario financiero existente conservado, con valores y supuestos etiquetados; evidencia recuperable. Probability Engine conserva resúmenes/gráficos y añade simulación editable, recuperación tras recarga, comprobación y descarga. El refresco del portafolio en segundo plano conserva el formulario y resultado en curso.
- Resúmenes importados: conserva parámetros de distribución y umbrales; evidencia `declared_summary_only`, no reproducible sin muestra y entorno originales. Ignora certificaciones aportadas por el cliente.

[Contrato y límites numéricos completos](FINANCIAL_PROBABILITY_CORE.md), [API](CORE_API.md). Los cuatro motores financieros y Monte Carlo están cubiertos; otros motores de riesgo y los contratos GIS/BSIE/optimización no se sustituyen en este incremento.

## Evidencia de validación

| Comprobación | Resultado |
| --- | --- |
| Regresión backend | 299 aprobadas; una integración externa omitida, sin fallos |
| Frontend | 26 aprobadas |
| BSIE / sanitario / transporte científico / probabilidad Python | 27 / 11 / 1 / 6 aprobadas |
| Nuevas pruebas financieras/probabilísticas | 10 casos, incluidos en el total backend; casos conocidos, precisión, semillas, alteraciones, históricos, rollback y HTTP |
| Navegador con fixtures aislados | 66 comprobaciones; 35 vistas, sin errores de ejecución |
| Fuentes preparadas | API 231 archivos y web 144, hashes de manifiestos verificados |
| Fuentes de aplicación modificadas | 11 archivos coinciden con los paquetes finales; 14 fuentes preservadas sin cambios |
| Integración real Chrome → proxy → API → Atlas | 15 grupos aprobados; 111 respuestas API observadas, cero excepciones de ejecución; sin interceptar APIs |
| Capturas reales | 12, incluido portafolio/evidencia y página probabilística en 390/1440 px |

[Regresiones](evidence/phase-5-engines-regression.json), [navegador aislado](evidence/phase-5-engines-browser.json), [integración real](evidence/phase-5-engines-live.json), [paquetes](evidence/phase-5-engines-packaging.json), [preservación de fuentes](evidence/phase-5-engines-source-review.json).

La integración validó VPN de `0.010000` entre flujos `-9007199254740992.01` y `9007199254740992.02`; comprobó su persistencia exacta, contrato y exportación. Ejecutó el formulario financiero con un activo/valoración de ensayo y VPN cero conocido. Ejecutó Monte Carlo desde Chrome con un factor constante y comprobó P5/P50/P95 = 20, persistencia de semilla 17, segunda ejecución idéntica, referencia al proyecto, recuperación tras recarga y descarga JSON real. También comprobó rechazo de periodicidades incompatibles/semillas inválidas y permisos de consulta, tenant ajeno y revocación. Las coordenadas del dispositivo fueron emuladas: no son GPS físico.

Los registros históricos del comparador siguen reproduciéndose con su motor anterior; entradas históricas inválidas no se certifican ni crean proyectos nuevos. Invitación manual, revocación, auditoría completa (40 eventos en la comprobación) y transporte Node/Python protegido también pasaron. Vercel conserva el sondeo HTTP: no se declara soporte nativo de WebSocket en ese hosting.

El primer intento se detuvo por conexión transitoria en preflight, antes de registrar cuentas. Otro detectó que el verificador de Chrome trataba un textarea como input; se corrigió únicamente el verificador. Ese intento respaldó y limpió sus datos. El recorrido completo posterior terminó correctamente. Cada intento conserva su informe privado; no se ocultó una excepción de la aplicación ni se relajaron aserciones.

## Datos y recuperación

Ejecución final: `atlas-core-20261024025409-538dd7acbf0e`, 02:54:09–02:55:20 UTC del 24/10 (noche del 23/10 en Bogotá). Postflight independiente iniciado a las 02:55:40 UTC. Los dos tenants nuevos y sus registros de identidad, activos, comparaciones, proyectos, jobs, valoraciones y auditoría propia fueron respaldados y retirados. Un proceso nuevo confirmó cero filas de esos tenants en las nueve colecciones principales y 58 colecciones registradas adicionales, incluidos jobs y valoraciones. También comprobó los intentos anteriores y los aliases/protección/salud.

Respaldo BSON acotado: `.vercel/staging-atlas-core-20261024025409-538dd7acbf0e/owned-test-records.bson`; SHA-256 `d60405b92f69a996f73f6b73790b2d04014b6b1b3b6ac20d322220033cb3d366`. No contiene un respaldo completo del Atlas compartido. Contadores compartidos y trazas globales de seguridad/cadena hash se conservaron.

Fuente previa: `.vercel/backstage-financial-probability-20261024T023907Z/source.zip`, 903 archivos, lectura y hashes comprobados. Puntero privado `.vercel/backstage-financial-probability-latest.json`. La revisión de fuentes confirma que App, estilos, entrada orbital, motores históricos y conexión/esquema Atlas permanecen idénticos a ese respaldo. No usar una restauración global del árbol de trabajo.

Para revertir staging se conservan como referencia los Preview funcionales de comparación anteriores: API `dpl_EXcJoTYMZMvGXHQMTCvH3niPkYbv`, web `dpl_H32TCaeVvcTepGsqEsSjFfzssFra`. No se ejecutó rollback ni promoción de producción. Restaurar código no elimina ejecuciones guardadas y una versión nueva no disponible debe seguir leyéndose como registro sin certificación de replay.

## Siguiente alcance

Extender los contratos a GIS/optimización, manteniendo los motores y datos existentes. Antes de producción quedan respaldo completo/restauración aislada de Atlas, configuración, observabilidad, reversión y autorización expresa de publicación. No hay proveedor GPS/sensores operativo ni se ha contratado uno. Este incremento entrega finanzas y Monte Carlo verificables dentro del entorno de pruebas autorizado.
