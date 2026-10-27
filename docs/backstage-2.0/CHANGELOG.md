# Cambios de recuperación

## 2026-10-23 — Reglas versionadas y trazabilidad GIS/rutas

Inventario de reglas existentes, catálogo espacial y configuración SOI con revisión/auditoría. GIS sobre motores conservados; evidencia de optimización con restricciones, unidades, fuentes y parámetros efectivos, comprobación independiente, exportación y repetición sin sobrescribir. Aprobación bloqueada ante recursos/configuración/evidencia cambiados. Trece casos nuevos, 312 pruebas backend aprobadas/una externa omitida y 18 grupos reales de staging aprobados. Datos de ensayo retirados; producción original intacta. [Informe](PHASE_5_SPATIAL_REPORT.md), [reglas](BUSINESS_RULES.md).

## 2026-10-23 — Finanzas y Monte Carlo reproducibles en staging

Motor financiero v2 decimal, Monte Carlo versionado con modelo/semilla/factores, contratos del servidor y referencias atómicas de proyectos. Comprobación y exportación por organización, historial recuperable y resúmenes importados sin certificación ficticia. Quince grupos reales aprobados, 111 respuestas API observadas y limpieza independiente verificada; 299 pruebas backend aprobadas/una externa omitida y suites existentes aprobadas. Identidad visual, motores históricos y MongoDB Atlas conservados; producción intacta. [Informe](PHASE_5_ENGINES_REPORT.md), [contrato](FINANCIAL_PROBABILITY_CORE.md).

## 2026-10-23 — Cierre de validación de comparación reproducible

Publicado en Preview el control final para registros históricos inválidos: no se certifican y crear un proyecto devuelve 409. Doce grupos integrados reales pasaron, incluida recarga sobre documentos nuevos, precisión decimal, exportación, histórico v1, proyecto e identidad. Revalidadas trece pruebas de contrato; fuentes visuales y motor decimal conservados. Limpieza independiente y destinos originales verificados. [Informe vigente](PHASE_5_REPORT.md).

## 2026-10-22 — Intelligence Core: comparación reproducible en staging

Contrato de entradas, unidades, fuentes, versión y huellas en los snapshots Atlas existentes; motor v2 decimal y v1 congelado para históricos; replay/export y referencias de proyecto. Trece pruebas nuevas, regresión backend 289 aprobadas/una externa omitida, frontend 26, suites científicas aprobadas y 66 comprobaciones de navegador existentes. Once grupos reales de staging sin interceptar APIs; descarga real y recálculo independiente confirmados. Tenants de ensayo retirados; producción original intacta. [Informe](PHASE_5_REPORT.md), [contrato](INTELLIGENCE_CORE.md).

## 2026-10-22 — Staging protegido desplegado y validado

Dos proyectos propios en Vercel Preview con Atlas de pruebas y claves de sesión independientes. Nueve comprobaciones reales sin interceptar APIs: entrada/login, territorio emulado/activo/análisis/proyecto, invitación/aceptación, rol/revocación, auditoría/sondeo y RPC Python protegido. Cuatro pruebas locales de transporte aprobadas; fuentes visuales de Fase 4 preservadas. Limpieza de tenants confirmada desde otro proceso, con conservación de trazas globales. Producción sin cambios de destinos o dominios. [Informe y acceso](STAGING_REPORT.md).

## 2026-10-22 — Atlas de pruebas: validación integrada aprobada

Aplicados los tres índices de invitaciones y aprobadas diez comprobaciones contra Atlas real: persistencia entre conexiones, aceptación simultánea única, protección concurrente de administrador, flujo activo/análisis/proyecto, reversión antes del commit, permisos HTTP/WebSocket y auditoría. Respaldo BSON de 22 documentos del ensayo restaurado y validado; limpieza confirmada desde otro proceso. Sin cambios de aplicación ni despliegue. [Informe](ATLAS_VALIDATION_REPORT.md).

## 2026-10-22 — Fase 4 local aprobada

Invitaciones manuales con aceptación, vencimiento y revocación; autorización transaccional de cambios de miembros; protección del último administrador activo e invalidación de invitaciones antiguas al revocar acceso. Hechos de auditoría atómicos para las operaciones incorporadas, saneamiento anidado y recuperación del panel de auditoría. Perfil vigente por sondeo/foco. 273 pruebas de backend y 26 de frontend aprobadas; una integración externa omitida; 66 comprobaciones de navegador. Sin aplicar índices, escribir en Atlas o publicar. [Informe](PHASE_4_REPORT.md).

## 2026-10-22 — Fase 3 local aprobada

Recorrido territorio/activo → análisis configurable → proyecto existente → recuperación. Enlace transaccional e idempotente en MongoDB Atlas, contexto por usuario/organización, historial y URL, versiones independientes y reintento ante errores temporales. 263 pruebas de backend aprobadas y una externa omitida; 26 de frontend; 26 recorridos conservados, 20 comprobaciones de diseño y 11 del nuevo recorrido. Sin publicación ni escrituras en Atlas. [Informe](PHASE_3_REPORT.md).

## 2026-10-22 — Fase 2 aprobada

Tokens negro/rojo consolidados, siete componentes integrados en activos y comparación, diálogos y menú móvil con manejo de foco, estados de consulta recuperables y validación en siete tamaños. Backend/contratos compartidos preservados por hash; sin despliegue ni escrituras Atlas. [Informe](PHASE_2_REPORT.md).

## 2026-10-21 — Fase 1 aprobada

- Recuperada composición global de BACKSTAGE con accesos explícitos a SOI y Clean Com.
- Membresías vigentes en autorización general; corregido restablecimiento accidental de claims antiguos en rutas con autenticación repetida.
- WebSocket nativo aislado por organización, canal y rol, con revalidación.
- Contratos generales de activos, GIS y comparación; misma persistencia Atlas e IDs físicos.
- Ambos comparadores disponibles; snapshots generales guardables y recuperables; fuente de algoritmos compartida compatible.
- CI sin publicación automática; empaquetado científico y web con hashes y locks.
- Pruebas HTTP, sockets, arquitectura, navegación y matriz de capturas documentadas.

No hubo despliegue, escritura Atlas, cambio de secretos ni modificación de las pantallas industriales preservadas. [Informe completo](PHASE_1_REPORT.md).

## 2026-10-21 — Fase 0

Auditoría y snapshot restaurable de código, cinco documentos diagnósticos, inventario, matriz de riesgos y propuesta posterior. Los documentos de esa fase describen el estado observado entonces; sus hallazgos no deben confundirse con cambios ya publicados. [Auditoría](RECOVERY_AUDIT.md).
