# BACKSTAGE — sistema de diseño consolidado, Fase 2

## Referencia y alcance aprobado

Se tomó como referencia la interfaz activa al cerrar Fase 1: negro/rojo, portada orbital, superficies oscuras y distribución existente. Las capturas de `evidence/phase-1-ui` son la referencia de comparación. La aprobación «sí» autoriza esta consolidación local; no autoriza publicar ni rehacer toda la plataforma.

El antiguo `styles/theme.css` no se importaba y contenía otro tema cian junto a resets globales. Se convirtió en un archivo de tokens, se carga explícitamente y no incorpora esos resets. Los aliases antiguos, incluidos `--accent-cyan` y `--accent-blue`, mantienen los valores rojos de la interfaz activa. No se aplicó automáticamente la paleta sugerida en el documento maestro.

## Tokens

| Función | Valor conservado o consolidado |
| --- | --- |
| Fondo principal | `--canvas: #050505` |
| Superficies | `--surface-base: #0b0b0d`, `--surface-raised: #151518`, `--surface-panel: #0f172a` |
| Marca | `--brand: #ff2b2b`; alias fuerte histórico `#e11d2e` |
| Texto | `--ink: #ffffff`, secundario `#a0a0a5`, atenuado de controles `#8b8b94` |
| Semántica | Éxito `#10d981`, advertencia `#fbbf24`, error `#ff3b30`, información `#3b82f6` |
| Foco | `--focus-ring: #ff6b75` |
| Espaciado | 4, 8, 16, 24, 32 y 48 px |
| Controles compartidos | Alto mínimo 44 px; campos del piloto de 16 px |
| Movimiento | Control 160 ms, panel 220 ms, diálogo 200 ms |

La tipografía conserva Inter/Geist y las alternativas del sistema. Los colores de éxito, advertencia e información no se sustituyen por rojo. El color presionado del botón nuevo se define por separado del alias histórico para mantener contraste legible.

Los tests numéricos verifican al menos 4.5:1 para los pares de texto de los controles compartidos y 3:1 para el indicador de foco contra la superficie comprobada. Esto no certifica el contraste de todos los gráficos, mapas o componentes históricos.

## Siete componentes integrados

| Componente en `frontend/src/components/ui` | Comportamiento | Uso efectivo |
| --- | --- | --- |
| Button | Variantes semánticas, tipo explícito, disabled/busy, foco y spinner sin progreso ficticio | Inventario, selección de modo y método de comparación, cierre de diálogos |
| Input | Label asociado mediante ID, descripción/error asociados, soporte de input/select/textarea y ref | Alta general y búsqueda/nombre/dirección de candidatos |
| Card | Contenedor con secciones y estilos propios, sin redefinir `.card` global | Formulario de alta general |
| Modal | Dialog nativo en portal; nombre accesible, fondo inerte, ciclo de Tab, Escape, backdrop y retorno de foco | Selección de candidatos en ambos comparadores |
| DataTable | Caption, cabeceras de columna y fila, IDs estables, región desplazable por teclado | Inventario general |
| EmptyState | Estado vacío o fallo explicado con acción real de recuperación | Inventario sin registros y fallo de consulta |
| LoadingState | Estado anunciado y marcador de carga; respeta movimiento reducido | Consulta de inventario y tabla compartida |

Se extienden los cuatro componentes existentes; se añaden tres. No se instala otra biblioteca de interfaz. Los estilos usan `ui-*` para evitar modificar incidentalmente tarjetas, modales o formularios históricos. Las otras pantallas podrán adoptar estos componentes de forma gradual; no se declara terminada esa adopción en toda la plataforma.

## Shell y accesibilidad

Se mantiene el shell de `App.jsx`. Se añaden enlace para saltar al contenido, identificación de navegación/página activa y relación entre el botón móvil y el panel. En 768 px o menos, el menú cerrado queda inerte. Abierto, se contiene el foco, se impide interactuar con el contenido cubierto y Escape devuelve el foco al control de apertura. La etiqueta de cambio de organización queda asociada a su selector.

Los métodos de selección del comparador son grupos de botones con `aria-pressed`; no simulan un tablist sin su comportamiento de teclado. La preferencia de movimiento reducido elimina las transiciones de los componentes nuevos y del shell. La portada conserva su implementación y el comportamiento reducido que ya tenía.

## Estados y errores

Una consulta fallida del inventario muestra el fallo y permite reintentar. Conserva el último resultado correcto y no lo sustituye por registros inventados ni presenta un fallo como inventario vacío. Una respuesta vacía correcta se distingue de la carga y del fallo. Durante el guardado, el botón y los campos se bloquean; la validación requerida permanece en el formulario.

El piloto mantiene los contratos, IDs, capacidades y separación entre inventario general, portafolio inmobiliario y SOI. No cambia la persistencia MongoDB Atlas.

## Validación y límites

Las pruebas usan el build real con APIs aisladas, contraste numérico y capturas en 360, 390, 768, 1024, 1280, 1440 y 1920 px. El informe de Fase 2 registra el resultado final y la comparación visual. No equivalen a certificación WCAG completa, disponibilidad de proveedores cartográficos, rendimiento de equipos reales ni prueba con todos los lectores de pantalla. Los motores, backend y esquemas quedan fuera de esta intervención visual.
