# Fase 1 — Architectural Stabilization

Implementación local de la fase aprobada mediante «apruebo». Fecha: 21 de octubre de 2026, Colombia. Rama: `recovery/backstage-2-audit-20261021`. BACKSTAGE continúa como plataforma; SOI es su módulo sanitario. Persistencia: MongoDB Atlas.

## A. Estado y preservación

Se recuperaron los accesos globales reutilizando los componentes existentes. `MissionControl`, `RealEstatePortfolio`, `EarthArt`, `RetailZones`, `SoiWorkspace` y `SoiRoutes` conservan exactamente el contenido del snapshot de Fase 0; la integración del shell cambia deliberadamente. La portada y los estilos originales se conservan. [Revisión por hashes](evidence/phase-1-source-review.json).

No se ejecutaron escrituras, inicializaciones de índices, migraciones ni copias en Atlas. Tampoco despliegue, push o cambio de secretos. El backup comprobado es de código; no certifica restauración de datos.

## B. Cambios revisables

| Área | Resultado |
| --- | --- |
| Seguridad | Autorización HTTP por membresía vigente; eliminación de autenticación repetida que restauraba roles antiguos en integraciones, proyectos y scoring. WebSocket nativo filtra tenant/canal, exige administrador para auditoría y revalida autorización antes de cada evento y periódicamente. |
| Navegación | Centro general recuperado, activos generales y acceso al portafolio inmobiliario original. SOI, sus rutas y Clean Com son entradas explícitas. Deep links Clean Com y Back/Forward permanecen reconocibles. |
| Composición | Manifiestos de módulos pequeños, contratos neutrales y aliases de compatibilidad. Infraestructura Atlas canónica y validación geométrica sin dependencia de lógica sanitaria. |
| Activos y GIS | Lectura conjunta de inventarios con identidades `platform:id` y `soi:id`, filtro por organización y procedencia. Alta general reutiliza el repositorio original. Puntos, líneas y polígonos conservan geometría; un centro de encuadre no se convierte en observación puntual. |
| Comparación | Análisis territorial original como entrada inicial, criterios configurables conservados, selección de ambos inventarios y snapshots guardados/recuperables mediante contrato global. Motor original reutilizado y resultado recalculado en servidor. |
| Release | Paquetes Node/Python con locks y manifiestos SHA-256. CI valida, audita, compila, prueba navegador y prepara artefactos; carece de job de publicación. |

Los nombres físicos existentes de colecciones, contadores y versión de esquema se conservan. Esto evita una migración implícita; no supone que la separación física definitiva del Core esté terminada.

## C. Verificación

321 pruebas aprobadas: 258 backend, 18 frontend, 27 BSIE, 11 sanitarias, 1 RPC científico y 6 probabilísticas. Una prueba vial externa optativa queda omitida. [Informe de suites](../evidence/soi-release-checks.json).

26 recorridos de navegador con APIs aisladas, sin errores de ejecución: acceso general, SOI, borradores, mapas como destino, AirHeart, proyectos, formulario de activos, modos de comparación y recuperación de snapshots. 21 capturas de Command, activos y comparación en 360, 390, 768, 1024, 1280, 1440 y 1920 px; sin desbordamiento horizontal de página. Teclado y preferencia de movimiento reducido comprobados de forma básica. [Informe UI](../evidence/soi-browser-smoke.json), [capturas](evidence/phase-1-ui/).

El recorrido HTTP de alta → lectura → proyección GIS → comparación → recuperación usa las rutas y repositorios reales con un adaptador de almacenamiento de prueba, sin conexión Atlas. Se verifican IDs coincidentes entre fuentes, tenant ajeno, reducción/revocación de roles, evidencia incompleta y resultado adulterado. Las pruebas de arquitectura comprueban límites de importación, aliases, ausencia de ciclos en el nuevo Core y montajes únicos.

Compilación correcta. Auditorías npm de dependencias de producción sin vulnerabilidades notificadas en esa consulta; no equivalen a una auditoría integral de seguridad. [Paquetes verificados](evidence/phase-1-packaging.json).

## D. Límites pendientes

La corrección de SEC-01/SEC-02 está probada localmente y todavía no está publicada. No se afirma que hubiera explotación o difusión efectiva en el hosting productivo. WebSocket nativo y supervisor en memoria no se convierten en infraestructura durable de Vercel por este cambio; la interfaz mantiene su sondeo existente.

Las APIs del navegador son fixtures y las solicitudes cartográficas externas están bloqueadas. No certifican disponibilidad actual de mapas, GPS, sensores o clientes reales. La captura visual no tiene una referencia histórica aprobada para comparación píxel a píxel. El build conserva las advertencias de tamaño de MapLibre; no se certifican rendimiento ni accesibilidad completos. El workflow modificado no se ha ejecutado en GitHub durante esta fase.

## E. Siguiente gate

Fase 1 cerrada en local dentro del alcance aprobado. La Fase 2 propuesta se limita a inventariar y consolidar tokens y componentes existentes, preservando negro/rojo y portada orbital, con revisión de las capturas y referencias visuales antes de cambiar pantallas. Requiere aprobación de ese alcance; no incluye despliegue ni nuevas industrias. Publicación, staging conectado y cambios de datos requieren revisión específica de la versión, configuración, backup y rollback.

Dependencias: aprobación del alcance visual y selección de referencias actuales; no requiere conectar un proveedor nuevo. Riesgos: pérdida de identidad, cambios de distribución móvil y alteración accidental de los recorridos recuperados. Aceptación: referencias aprobadas antes de intervenir cada pantalla, cambios graduales sobre componentes existentes, preservación de enlaces/contexto y repetición satisfactoria de los recorridos y la matriz de siete tamaños. No se autoriza reescribir toda la interfaz.
