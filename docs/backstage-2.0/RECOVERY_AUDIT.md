# BACKSTAGE 2.0 — Recovery & Audit

Fecha: 21 de octubre de 2026, America/Bogota; evidencias técnicas en UTC.

**Fase 0 completada; Fase 1 pendiente de aprobación.** Durante esta fase no se modificó código de la aplicación, no se escribieron datos en Atlas y no se publicó otro despliegue. Se creó una rama, una copia recuperable y documentación de diagnóstico.

## Alcance y referencias

Se leyó completo el último prompt maestro, incluida su orden de ejecutar únicamente la Fase 0. Los adjuntos anteriores estaban truncados. BACKSTAGE es la plataforma; SOI es el módulo sanitario. La decisión reiterada del propietario de usar exclusivamente **MongoDB Atlas** se mantiene: una tecnología citada como candidata en el documento no autoriza introducir otra base de datos.

| Referencia | Estado observado |
| --- | --- |
| Repositorio activo | `backstage_v310/BACKSTAGE-3.1.0` |
| Rama inicial | `backstage-3.1.0-final` |
| Rama aislada | `recovery/backstage-2-audit-20261021` |
| Commit base | `ce18b6d7b79867d940e1689d61755446acbf974c` |
| Último commit | 7 de octubre de 2026; corrección de onboarding/sesión |
| Historia disponible | 390 commits, repositorio no superficial |
| Estado anterior a la auditoría | 86 archivos modificados, 31 eliminados y 172 sin seguimiento |
| Publicación registrada antes de Fase 0 | API `dpl_93uunWbhwbeQdh3WtqkLxwmrdEjF`; web `dpl_5sviMLHKHcFxekswJNmqtWZecp9E` |

El commit base no representa todo el producto actual: numerosas mejoras y regresiones posteriores solo existen en el árbol de trabajo y snapshots ignorados por Git. Ningún commit se certificó como estable por su título. Se conservaron historia y reflog; no hubo reset, clean, stash ni restauración masiva. La copia vecina `BACKSTAGE-3.1.0-main` no se modificó ni se adoptó automáticamente como referencia estable.

El [inventario verificable](evidence/repository-inventory.json) registra rutas, navegación, archivos por capa, dependencias, nombres de variables y acoplamientos. Contiene 197 declaraciones estáticas de rutas, no un conteo exhaustivo de endpoints efectivos: hay factorías, recursos dinámicos y alias. La presencia de una ruta no prueba su autorización.

## Preservación comprobada

Antes de crear documentos o modificar referencias Git se copiaron **451 archivos de código y configuración no secreta**:

- Directorio local: `.vercel/backstage-recovery-20261022T004525Z/`.
- Archivo: `source-and-nonsecret-config.zip`.
- Manifiesto por archivo y estado inicial: `manifest.json`.
- SHA-256 del ZIP: `9a075d16b6e4adf02f4ee06debdccae7e43f596982f694ffd559c93de02c5aee`.
- Restauración real: `restore-validation/`, con extracción de todos los archivos, comparación individual de hashes y lectura válida de los tres `package.json`.

Se excluyeron entornos privados, secretos, dependencias descargadas, cachés, datasets empresariales y evidencias anteriores. Se contrastó el contenido copiado con valores sensibles del entorno sin imprimirlos. Es una copia local de código, no un backup externo ni una imagen completa del equipo.

Los 31 archivos ya eliminados al comenzar siguen registrados como eliminados; Fase 0 no los borró ni reintrodujo. Los confirmados son consultables en Git. También se verificó por CRC `.vercel/retired-persistence-20261021-180348.zip`, que conserva código retirado previamente y migraciones históricas. Otro ZIP de retirada está vacío/inválido y no debe utilizarse.

Procedimiento de recuperación selectiva:

1. Verificar el SHA-256 del ZIP y el manifiesto.
2. Revisar `restore-validation/` o extraer en otra carpeta nueva y vacía.
3. Comparar hashes y seleccionar exclusivamente los archivos del parche aprobado.
4. Preparar el parche en la rama aislada, conservando mejoras posteriores.
5. Repetir pruebas y revisar el diff antes de proponer publicación.

No restaurar todo desde HEAD: perdería código posterior sin confirmar y reincorporaría requisitos de persistencia retirados. Consultar un histórico no autoriza activarlo como runtime.

## Protección de datos: límite explícito

Atlas almacena colecciones generales, espaciales e industriales; `backend/infrastructure/soiMongo.js` declara índices, contadores, transacciones y TTL. En esta fase no se ejecutaron `mongo:init`, importaciones, migraciones, verificaciones que crean tenants ni limpiezas operativas.

**No se ha verificado un backup recuperable de Atlas ni su capacidad de restauración a un instante.** El ZIP de código no recupera documentos. Antes de cambios de datos se deben comprobar proyecto/cluster autorizado, snapshots, retención y una restauración aislada. No se afirma que existan registros perdidos ni que un backup de datos ya esté disponible. Tampoco se inspeccionaron los datos privados del propietario para explicar su incidencia particular.

## Comparación histórica

A = original a preservar; B = mejora válida; C = capacidad a delimitar; D = regresión confirmada; E = decisión pendiente.

| Clase | Evidencia | Tratamiento propuesto |
| --- | --- | --- |
| A | MissionControl, portafolio, AirHeart, proyectos, informes y comparador existen en código e historia | Recuperar accesibilidad y contratos, sin reconstruirlos |
| A/B | Identidad BACKSTAGE, negro/rojo, portada orbital, contexto compartido y recuperación de sesión | Preservar; medir antes de cambiar tokens/layouts |
| B | Atlas, auditoría encadenada, transacciones y procedencia explícita | Conservar y ampliar cobertura transversal |
| B | Multicriterio/finanzas, probabilidad, GIS/BSIE, OR-Tools y predicción | Reutilizar; no simplificar ni duplicar algoritmos |
| C | Residuos, saneamiento, carbono y sensores sanitarios | Mantener dentro de SOI |
| C | Comparación configurable y BSIE, motores generales expuestos bajo contratos SOI | Separar responsabilidad mediante adaptadores compatibles |
| D | App.jsx abre SoiWorkspace en mission-control y portfolio-assets; originales detrás de controles “heredados” | Restaurar accesos generales y acceso explícito al módulo |
| D | clean-com se redirige a soi | Recuperar acceso identificable al caso existente |
| D | Comparador global prioriza SOI y persistencia industrial | Recuperar entrada transversal sin eliminar motores |
| D | WebSocket de seguridad difunde eventos entre organizaciones | Prioridad de seguridad; reproducción local confirmada |
| E | locations y soi_assets son inventarios distintos | Definir contrato y adaptación sin fusionar datos a ciegas |
| E | Recorrido exacto que el propietario identifica como roto aún no especificado | Reproducirlo antes de declarar recuperación |

## Verificación ejecutada en Fase 0

| Comprobación | Resultado |
| --- | --- |
| Backend Node | 249 aprobadas; 1 integración externa optativa omitida |
| Frontend Node | 13 aprobadas |
| BSIE Python | 27 aprobadas |
| Sanitario/optimización/predicción Python | 11 aprobadas |
| RPC científico Python | 1 aprobada |
| Probabilidad Python | 6 aprobadas |
| Total de suites | 307 aprobadas; 1 omitida; ningún fallo en esas suites |
| Compilación frontend aislada | Correcta, 105 módulos; advertencias de chunks grandes y API CJS de Vite |
| Aislamiento WebSocket local | Violación confirmada; no es una prueba aprobada de seguridad |
| Recorridos reales del propietario | Pendientes |
| LCP/INP/CLS, WCAG y siete breakpoints | No medidos en esta fase |

Las suites usan adaptadores o fixtures matemáticas; no acreditan conexiones GPS/OAuth, streaming distribuido, recuperación de datos o funcionamiento completo del producto. No se cambiaron pruebas para hacer pasar esta auditoría. La compilación aislada quedó dentro del directorio de backup, sin publicar.

Evidencias nuevas: [JavaScript](evidence/javascript-baseline.json), [Python](evidence/scientific-baseline.json), [WebSocket](evidence/websocket-isolation-audit.json). Las verificaciones visuales anteriores se conservan como históricas y no se presentan como ejecución visual nueva.

## Siguiente gate

Se solicita aprobar únicamente la Fase 1 delimitada en [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). Esa aprobación no autoriza producción, cambios de secretos ni operaciones destructivas de datos.
