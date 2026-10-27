# Riesgos y regresiones — Fase 0

P0: seguridad o datos sin recuperabilidad. P1: contrato/función central afectada. P2: limitación o deuda previa a expansión empresarial. “Confirmado” significa evidencia de código o reproducción; no demuestra un incidente real del propietario.

| ID | Prioridad/estado | Evidencia | Impacto | Medida propuesta, no aplicada |
| --- | --- | --- | --- | --- |
| SEC-01 | P0, reproducción local confirmada | wsServer.js: security difunde a todos los clientes OPEN; upgrade valida JWT sin rol específico | Un viewer de otra organización recibe eventos de auditoría en servidor nativo | Filtrar tenant/canal, exigir permiso, revalidar vigencia/revocación y probar casos cruzados |
| DATA-01 | P0 para cambios de datos; backup no verificado | Backup de código válido, sin prueba administrativa de restauración Atlas | Rollback de código no revierte documentos | Verificar snapshot/restauración aislada antes de cambios de datos |
| UX-01 | P1, confirmado | App.jsx abre SoiWorkspace para mission-control y portfolio-assets | Funciones globales sustituidas; originales “heredadas” | Recuperar navegación y módulos explícitos |
| UX-02 | P1, confirmado | Normalización de clean-com hacia soi | Acceso al caso/archivo deja de ser reconocible | Recuperar entrada sin alterar fuentes/datos/permisos |
| DATA-02 | P1, contratos separados; volumen de datos no inspeccionado | Portafolio usa locations; Explorer/LiveTerritoryOverview/comparador usan soi_assets | Un activo general puede no aparecer en las consultas sanitarias del mapa/comparador | Contrato neutral y adaptación con procedencia; no fusionar automáticamente |
| CMP-01 | P1, confirmado | Comparador configurable SOI por defecto y `/soi/comparisons`; original preservado aparte | Capacidad global subordinada a un módulo | Conservar motores/snapshots y recuperar entrada transversal |
| SEC-02 | P1, revisión estática | organizationContext reutiliza membresías JWT; guard fresco consulta Atlas | Revocaciones/roles pueden aplicarse de manera desigual | Pruebas transversales de revocación y guard general compatible |
| REL-01 | P1, configuración confirmada; fallo de deploy no reproducido aquí | CI despliega raíz, release científico usa paquete Node/Python | Otro deploy puede omitir función científica/archivos | Alinear empaquetado/CI y probar staging/rollback |
| REL-02 | P1, condición observada | Supervisor/WebSocket solo en main; bus por proceso; worker BSIE inline | Automatización/streaming no son durables por existir en código | Ejecución conforme al hosting, jobs fiables y estados honestos |
| GOV-01 | P1, confirmado | 86 modificados, 31 eliminados, 172 untracked inicialmente | HEAD no recupera por sí solo todo el producto publicado | Snapshot verificado y parches/commits selectivos futuros |
| GOV-02 | P1, confirmado | CI permite deploy por push main; revisores de production no inspeccionados | Aprobación del propietario puede no estar impuesta técnicamente | Revisar gate; no hacer push/deploy durante auditoría |
| QA-01 | P1, cobertura insuficiente comprobada | Suites pasan pero SEC-01 se reproduce | Conteos verdes no prueban plataforma completa | E2E reales, pruebas de arquitectura y aceptación del propietario |
| NUM-01 | P2, fuente comprobada | Financial usa Number/toFixed; UI monetaria fija COP | Falta contrato decimal/moneda para expansión financiera | Mantener motor y diseñar contrato/versiones con pruebas numéricas |
| UX-03 | P2, estático | Negro/rojo, tokens llamados cyan/blue y valores navy literales | Rediseño masivo puede perder identidad | Inventario y referencias aprobadas antes de consolidar tokens |
| PERF-01 | P2, advertencia de compilación | Chunk MapLibre ~1.03 MB, worker ~510 kB, entrada ~418 kB sin comprimir | Exige medición; no prueba incumplimiento LCP/INP | Medir equipos/rutas reales antes de declarar objetivos logrados |
| EXT-01 | P2, dependencia externa | OAuth/proveedores requieren cuotas, credenciales y condiciones | Código o pantalla puede confundirse con conexión real | Estados y verificación de fuente/fecha/condiciones |

## Alcance de SEC-01

La [reproducción](evidence/websocket-isolation-audit.json) creó un servidor HTTP/WebSocket local, dos JWT sintéticos de organizaciones distintas y un evento ficticio. No consultó Atlas, no usó tokens existentes ni almacenó eventos. Confirmó suscripción viewer y recepción del evento de otra organización. **No se confirmó que el transporte WebSocket nativo esté activo en Vercel.** El handler serverless y el sondeo frontend son mecanismos diferentes.

El hallazgo sigue abierto: la orden actual autoriza auditoría, no el parche. Debe ser el primer cambio de seguridad de la Fase 1 aprobada. No debe habilitarse ese canal nativo como servicio empresarial antes de corregirlo.

## Decisiones pendientes

1. Definir ubicación, activo general y activo industrial; decidir adaptación antes de unificar datos físicamente.
2. Conservar Clean Com y sus fuentes; no cambiar DEMO/HISTORICAL/real sin evidencia y decisión del propietario.
3. Preservar flujo territorial y criterios configurables del comparador sin obligar a trabajar dentro de SOI.
4. Identificar el recorrido exacto reportado como roto: la auditoría detectó regresiones, pero no acredita resolver esa incidencia particular.
5. Elegir alcance/proveedor de streaming y colaboración en sus fases, sin añadir dependencias ahora.

## Contención de Fase 0

No parchear producción, cambiar secretos, eliminar históricos, fusionar inventarios, crear tenants en Atlas o ejecutar migraciones para completar una auditoría. Las comprobaciones nuevas fueron locales y se documentan con sus límites.
