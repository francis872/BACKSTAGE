> Publicación vigente (24/10/2026, 13:33 Bogotá): [BACKSTAGE](https://backstage-web-seven.vercel.app) publicado y verificado en sus proyectos originales. Conexión Atlas y credenciales conservadas; el destino sigue siendo el Atlas compartido de pruebas. [Resultado, reversión y pendientes](docs/backstage-2.0/PRODUCTION_RELEASE.md). Los estados inferiores conservan alcance histórico.

> Estado vigente (24/10/2026, Bogotá): UI/UX simplificadas y publicadas en [staging protegido](https://backstage-staging-web.vercel.app). Inicio por tareas, ayuda contextual y lectura cómoda; 76 comprobaciones UI y 20 grupos reales aprobados. Carga, reversión, limpieza y respaldo completo actualizado con restauración aislada comprobados. Producción original intacta. [UI/UX](docs/backstage-2.0/USABILITY_REPORT.md), [preparación y pendientes reales](docs/backstage-2.0/READINESS_REPORT.md). Las notas inferiores son históricas.

> Estado actualizado (24/10/2026, Bogotá): respaldo lógico completo de Atlas y restauración aislada comprobados (75 colecciones, 106 documentos, 238 índices); 325 pruebas backend y 26 frontend aprobadas. Reglas comerciales y alertas del administrador preparadas en nuevos Preview. Faltan aceptación integrada, carga, reversión remota y cobertura continua antes de producción. La revisión automática impidió iniciar la aceptación por falta de créditos del workspace. [Estado y continuación](docs/backstage-2.0/READINESS_REPORT.md). Las notas siguientes conservan su alcance histórico.

> Intelligence Core aplicado al comparador y proyectos (23/10/2026): [abrir staging](https://backstage-staging-web.vercel.app). Decimales exactos, versión y huellas de análisis, comprobación y exportación; doce grupos de integración real aprobados y datos temporales retirados. MongoDB Atlas e identidad de BACKSTAGE conservados; producción sin cambios. [Informe y límites](docs/backstage-2.0/PHASE_5_REPORT.md).

> Estado vigente (23/10/2026, Bogotá): reglas versionadas y trazabilidad GIS/optimización desplegadas en staging con Atlas de pruebas. 312 pruebas backend aprobadas y una externa omitida; 18 grupos reales de integración aprobados y datos temporales retirados. Producción original intacta. [Resultado y límites](docs/backstage-2.0/PHASE_5_SPATIAL_REPORT.md), [reglas del negocio](docs/backstage-2.0/BUSINESS_RULES.md). Las notas siguientes conservan su alcance histórico.

> Estado vigente (23/10/2026, Bogotá): finanzas y simulación Monte Carlo desplegadas y verificadas en staging protegido con MongoDB Atlas. Quince grupos integrados aprobados; 299 pruebas backend aprobadas y una externa omitida; suites existentes sin fallos. Producción original sin cambios. [Resultado y límites](docs/backstage-2.0/PHASE_5_ENGINES_REPORT.md). Los estados siguientes conservan su alcance histórico.

> Estado vigente (22/10/2026): validación integrada de Platform Core en Atlas de pruebas completada. [Informe y evidencia](docs/backstage-2.0/ATLAS_VALIDATION_REPORT.md). Índices aplicados y datos temporales retirados; siguiente paso: validación en hosting de staging. No se ha desplegado este incremento.

> Estado vigente de recuperación (22/10/2026): Fase 4 implementada y verificada en local. [Informe y límites](docs/backstage-2.0/PHASE_4_REPORT.md). No se ha desplegado; falta validar transacciones e índices nuevos en Atlas de pruebas.

> Estado vigente de recuperación (22/10/2026): recorrido aprobado de Fase 3 completado en local. [Informe y límites](docs/backstage-2.0/PHASE_3_REPORT.md). La siguiente propuesta es Platform Core; no se ha publicado esta recuperación.

> Recuperación actualizada (22/10/2026): Fase 2 completada en local dentro del alcance visual aprobado. [Informe y límites](docs/backstage-2.0/PHASE_2_REPORT.md). Sin publicación de esta recuperación.

> Estado actual de recuperación (21/10/2026): Fase 1 aprobada e implementada en local. BACKSTAGE es la plataforma; SOI es un módulo y Clean Com tiene acceso propio. MongoDB Atlas se conserva. No se ha publicado esta recuperación ni escrito en Atlas. Ver [informe vigente](docs/backstage-2.0/PHASE_1_REPORT.md). Las referencias a publicaciones debajo son históricas.

> Actualización SOI: MongoDB de pruebas y fases sanitarias verificadas según [estado vigente](docs/SOI_SANITARY_PROGRESS.md). Este documento conserva despliegues e instrucciones históricos; el incremento sanitario ya está publicado; consultar las evidencias del enlace.


# BACKSTAGE 3.1.0 — Estado

## SOI — implementación local del 20 de octubre de 2026

Identidad y núcleo SOI integrados; rutas viales y DEM comprobados contra fuentes reales. Migraciones preparadas sin ejecutar; persistencia real, GPS físico y telemetría de flotas pendientes. No constituye un despliegue ni una aprobación de producción. Ver [progreso y evidencias](docs/SOI_PROGRESS.md).

## Archivo histórico anterior — publicación del 13 de octubre de 2026

- El antiguo menú CleanCom se reemplazó por SOI. Su caso Empresas Varias 2025 permanece compartido, identificado como DEMO, en el archivo histórico de SOI.
- Worker geoespacial modular, auditoría de 21 capas/tablas y visualización de geometrías reales; fuente original sin modificar.
- Tickets: 73.144 registros de 2025; los 14.294 de 2026 quedan fuera de los recuentos anuales. Eficiencia aún no evaluable por falta de unidades/entradas verificadas.
- Detalles: [auditoría Clean Com](docs/CLEAN_COM_AUDIT.md) y [arquitectura/API/reproducción](cleancom/README.md).

Los apartados siguientes conservan el estado de los trabajos anteriores.

Actualizado: 12 de octubre de 2026.

## Despliegue verificado

- Web: https://backstage-web-seven.vercel.app
- API: https://backstage-api.vercel.app
- Frontend, página de login, JavaScript y CSS responden HTTP 200.
- Rutas de identidad, ubicaciones, fuentes y trabajos espaciales, portafolio y unidades territoriales rechazan acceso anónimo con HTTP 401.
- 11 comprobaciones de lectura pasaron en las URL públicas. Informe local: `.vercel/production-readonly-report.json`.
- Migración de metadata de activos aplicada previamente en producción.
- 161 pruebas backend y 6 pruebas del motor probabilístico aprobadas en la validación anterior.

## Interfaz actualizada

- Portada con planeta en rotación, acceso circular "Explora tu territorio" y transición de acercamiento hacia el login.
- Login y registro centrados, con desplazamiento natural en pantallas bajas y ajustes de distribución en las vistas principales.
- Componentes compartidos sincronizados en BACKSTAGE-3.1.0 y BACKSTAGE-3.1.0-main; ambas versiones compilaron.
- 115 comprobaciones de navegador aprobadas usando APIs simuladas a siete tamaños de pantalla; rotación, zoom, teclado, navegación y movimiento reducido verificados.
- Frontend anterior: dpl_JRZVbKG64tc7w9XaqMREajXuJ4oq; la publicación final se registra debajo.
- Esta verificación de interfaz no ejecuta la prueba QA de escritura en producción pendiente de autorización.

- Paleta visual recuperada: azul marino, fondo casi negro, letras blancas y acentos/sombreados rojos. Conserva la rotación, el zoom de entrada y la distribución responsiva; ambas versiones compilaron y la URL pública fue revisada en móvil y escritorio.

## Acceso de Atlas

El bloqueo de conexión a Atlas se resolvió después de actualizar su lista de acceso de red. Se indicó crear una regla temporal `0.0.0.0/0` de seis horas. Es necesario confirmar su vencimiento en Atlas y configurar el acceso permanente previsto: una regla temporal no garantiza operación continua tras expirar.

## Verificación pendiente

La prueba integrada de registro/login, aislamiento organizacional, CRUD y persistencia espacial no se ejecutó. La revisión automática la rechazó porque crea datos en producción y requiere autorización explícita.

La propuesta está preparada en `.vercel/production-smoke.pending.cjs`, sin ejecutar. Crea dos organizaciones y usuarios QA, una ubicación, una fuente procedimental y un punto GeoJSON con su trabajo/tesela. La limpieza elimina los usuarios QA y la ubicación y archiva la fuente; permanecen las organizaciones vacías, registros espaciales archivados y trazas de auditoría. No usa ni modifica datos de organizaciones existentes.

La comparación multiciudad con datos analíticos reales requiere validación adicional. La actualización operativa actual utiliza consultas periódicas; no se presenta como una conexión WebSocket persistente en Vercel. Los estados healthy no prueban los flujos privados de escritura.

Consulta DEPLOYMENT_GUIDE.md para publicar con las configuraciones correctas de backend y frontend.
## Evolución territorial con fuentes actuales

Búsqueda mundial explícita, seguimiento de ubicación con permiso del navegador, meteorología Open-Meteo y selección territorial compartida entre Explorer, AirHeart, activos y proyectos. Actividad y portafolio se actualizan cada 30 segundos; clima y cartografía se consultan cada 5 minutos. Diagnósticos internos plegados para administradores.

Open-Meteo y el respaldo cartográfico OpenFreeMap/OpenMapTiles respondieron desde Vercel: se obtuvo una muestra limitada de 250 lugares del punto consultado en Medellín, con versión cartográfica identificada. Overpass no respondió. Población, riesgo, avalúos y DEM siguen requiriendo evidencia verificable.

Contratos, límites y comprobaciones: [Operación territorial actual](docs/LIVE_TERRITORY.md).

## Publicación preparada el 12 de octubre

- Backend: dpl_8WbBRsVh5DW3H4WXQZRyQuZddbAB, https://backstage-gncop2fny-franciscogloopez-8505s-projects.vercel.app.
- Frontend: dpl_HX8raB7e9192TbW9C28UMZfgVYCe, https://backstage-nn70encrg-franciscogloopez-8505s-projects.vercel.app.
- Ambas versiones construidas por Vercel y activadas en https://backstage-web-seven.vercel.app y https://backstage-api.vercel.app tras recuperar Atlas.
- 172 pruebas backend en la versión principal y 137 en la carpeta del IDE; ambas interfaces compilan.
- 31 comprobaciones de flujos territoriales con APIs simuladas; 10 de actualización y permisos; 2 de coordenadas editadas.
- La interfaz pública nueva pasó las comprobaciones de portada, login y registro en móvil y escritorio. La comprobación final confirmó que el dominio habitual sirve los mismos archivos de la versión verificada y que ambas bases están saludables.



## Corrección de sesión y experiencia — 12 de octubre de 2026

Los registros reales de Vercel confirmaron rechazos jwt expired en búsquedas, terreno y otros módulos: el frontend conservaba una sesión vencida y continuaba enviando su token. Ahora los HTTP 401 de peticiones protegidas limpian esa sesión y regresan al login una sola vez. Una respuesta tardía no cierra una sesión nueva; los errores de credenciales, permisos y disponibilidad no se confunden con caducidad. El login, registro y cambio de organización comprueban el token mediante /auth/me antes de abrir el espacio de trabajo. La API conserva la verificación de firma HS256, emisor, audiencia y vencimiento, y devuelve códigos de error estables. El proxy transmite también X-Organization-Id.

Los buscadores tienen etiquetas visibles, fondo oscuro, texto claro y foco de teclado. La ubicación del dispositivo se resuelve a municipio, región y país, conservando el punto GPS exacto; también se nombra la ubicación guardada por versiones anteriores. El seguimiento requiere pulsar el botón y se detiene al elegir otro territorio. Las coordenadas y la procedencia meteorológica quedan en detalles desplegables. Los resultados priorizan el lugar y el mapa; los datos guardados y las rutas quedan como opciones. La ficha del lugar está debajo del mapa. El terreno permite reintentar una carga fallida y sus vistas indican cuando las alturas, pendientes y curvas son simuladas.


Frontend activo: dpl_SW6eA6ieQU5mxctp5B6jz35Gssxj. Backend activo: dpl_CBUA8LkmxR5kn4TQr5V8TKqYEkwW. Web: https://backstage-web-seven.vercel.app. Informes locales: .vercel/auth-browser-report.json, .vercel/auth-public-report.json y .vercel/final-release-report.json.


### Registro real confirmado
