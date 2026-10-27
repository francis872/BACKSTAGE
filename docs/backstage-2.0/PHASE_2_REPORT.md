# Fase 2 — Backstage Design System

Fecha de cierre: 22 de octubre de 2026, Colombia. Alcance local aprobado mediante «sí»: consolidar el diseño existente, conservar identidad y funciones, verificar teclado/estados/siete tamaños. No incluye despliegue ni reconstrucción general.

## A. Estado

Fase 2 completada en su alcance aprobado. Referencia: rama `recovery/backstage-2-audit-20261021`, cambios locales sin commit nuevo. [Snapshot y revisión de fuentes](evidence/phase-2-source-review.json). Se conserva MongoDB Atlas; no hubo escrituras en la base, cambios de secretos ni publicación.

Se comprobó por SHA-256 que los 234 archivos de backend y contratos compartidos inventariados al empezar siguen idénticos. La portada, su globo, MissionControl, AirHeart, portafolio inmobiliario, proyectos y pantallas SOI conservan sus componentes. El shell y los pilotos visuales cambian de forma explícita.

## B. Cambios

- `styles/theme.css`, `index.css` y `main.jsx`: tokens activos negro/rojo, aliases compatibles y carga explícita del tema sin resets del tema cian antiguo. Comportamiento compartido de foco y movimiento reducido.
- `components/ui`: cuatro componentes existentes consolidados —Button, Input, Card, Modal— y tres nuevos integrados —DataTable, EmptyState, LoadingState—, con estilos propios. [Contratos y cobertura](DESIGN_SYSTEM.md).
- `AssetsWorkspace`: controles/tabla/estados compartidos, validación del formulario, bloqueo durante guardado y recuperación de consultas fallidas conservando el último inventario correcto.
- Ambos comparadores: diálogo compartido con nombre accesible, Tab contenido, fondo inerte, Escape, clic exterior y restauración del foco. Métodos y modos expresan su selección mediante botones, sin declarar tablists incompletos.
- `App.jsx` y `useMobileNavigation`: enlace para saltar al contenido, navegación identificada y control móvil accesible. Se conserva la distribución del shell.
- Harness de navegador, pruebas de contraste y CI: modo `--phase2`, informes independientes y capturas; el workflow continúa sin publicar. No se añadieron dependencias.

## C. Verificación

20 pruebas de frontend aprobadas, incluidos dos tests nuevos de contraste/aliases. Compilación correcta: 126 módulos. El build mantiene las advertencias anteriores de tamaño de MapLibre; no se declara una mejora de rendimiento por compilar correctamente.

En navegador pasaron los 26 recorridos funcionales conservados y 20 comprobaciones nuevas de diseño/accesibilidad, con cero errores de ejecución. Incluyen validación requerida, guardado ocupado, carga, vacío, recuperación del fallo con datos anteriores conservados, ambos diálogos y navegación móvil. [Informe detallado](evidence/phase-2-browser.json).

Hay 35 capturas de Command, activos, comparación, diálogo y portada en siete anchuras —360, 390, 768, 1024, 1280, 1440 y 1920 px— y cinco adicionales de carga, vacío, error, formulario y acceso. No se observó desbordamiento horizontal de página; la tabla conserva desplazamiento interno cuando lo necesita. Se revisaron visualmente móvil, escritorio, diálogo y portada.

Se compararon las 21 capturas equivalentes de Fase 1. Las siete de Command son idénticas a nivel de píxel en esta ejecución. Los cambios de activos/comparación corresponden a los controles y estados del piloto. [Diagnóstico de comparación](evidence/phase-2-visual-comparison.json). Las diferencias de píxeles son evidencia de revisión, no una certificación visual universal.

El paquete web actualizado contiene 135 archivos comprobados por hash. El paquete API existente de 218 archivos permanece compatible y sin modificaciones. [Verificación de paquetes](evidence/phase-2-packaging.json). Los motores científicos y sus pruebas anteriores no se volvieron a ejecutar para este cambio exclusivamente de interfaz; las fuentes protegidas no cambiaron. El workflow actualizado aún no se ha ejecutado en GitHub.

## D. Riesgos y límites

Las pruebas de navegador usan APIs aisladas y bloquean cartografía externa; no certifican proveedores, GPS, sensores o persistencia Atlas. No hay certificación WCAG completa, pruebas con todos los lectores de pantalla/dispositivos ni mediciones LCP/INP en usuarios reales. El contraste comprobado corresponde a los tokens de los componentes compartidos.

La adopción de los componentes es gradual: no todas las pantallas históricas usan ya los siete. Las clases antiguas se conservan para evitar un reemplazo global no revisado. El snapshot de entrada permite revertir selectivamente esta fase; no constituye un backup de datos.

## E. Próxima fase propuesta

Fase 3 — Global Workspaces: conectar los recorridos existentes de Command, Explore, Analyze y Operate, empezando por uno completo: seleccionar territorio → activo → análisis → proyecto → volver al contexto. Reutilizar páginas y APIs actuales; mantener SOI como módulo y MongoDB Atlas como persistencia.

Dependencias: aprobación del alcance y elección del recorrido prioritario. Riesgos: pérdida de filtros/borradores, referencias cruzadas entre inventarios y regresiones de navegación. Aceptación: recorrer el flujo completo, guardar/recuperar con permisos vigentes, conservar contexto y Back/Forward, y mantener las comprobaciones actuales. Sin nuevas industrias ni publicación dentro de esa propuesta. No se ha iniciado la Fase 3.
