# BACKSTAGE · Origin Design System

La identidad BACKSTAGE y la entrada orbital se conservan. El nuevo requisito sustituye la paleta principal roja por una identidad monocromática. Implementación: `frontend/src/styles/theme.css` y `styles/origin.css`, sobre los componentes existentes.

| Uso | Color |
| --- | --- |
| Fondo | `#08090B` |
| Superficie | `#17191D` |
| Contorno | `#343840` |
| Texto secundario | `#9298A2` |
| Acción principal | `#E5E7EB` |
| Texto principal | `#FFFFFF` |

Las alertas y las escalas científicas conservan colores semánticos. La tipografía utiliza Inter y las alternativas de sistema existentes; no se agrega una dependencia tipográfica remota obligatoria. La jerarquía usa título de espacio, objetivo de tarea, controles y detalles progresivos.

El explorador ofrece primero Proyectos, Activos y Comparar. Las demás capacidades están en Más herramientas. La búsqueda pregunta por el lugar con un ejemplo; las coordenadas, fuentes, herramientas de terreno y opciones avanzadas se despliegan cuando hacen falta. Los resultados muestran su tipo para distinguir un parque de una localidad. Cuenta contiene perfil, preferencias, sesión y salida. Organización contiene miembros, invitaciones, permisos, auditoría y diagnóstico interno.

Los controles mantienen etiquetas, foco visible, estado seleccionado, formularios con nombres accesibles y avisos de error/estado. Se respeta `prefers-reduced-motion`. Lectura cómoda se guarda por usuario y organización en el navegador y se recupera al entrar. Si el almacenamiento está bloqueado se utiliza memoria de la pestaña y se informa al usuario.

La verificación automatizada cubre anchos de 320, 390, 768, 1440 y 1920 píxeles, sin desbordamiento horizontal. Las capturas y el alcance están en [BACKSTAGE_TEST_REPORT.md](BACKSTAGE_TEST_REPORT.md). Esto no sustituye una sesión observada con una persona sin experiencia, pruebas completas con lector de pantalla ni una certificación WCAG.
