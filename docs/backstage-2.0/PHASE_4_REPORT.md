# Fase 4 — Platform Core

Fecha: 22 de octubre de 2026, Colombia. Autorización: «hazlo» para invitaciones, cambio de rol, revocación, aislamiento y auditoría, conservando BACKSTAGE y MongoDB Atlas.

## A. Estado

Implementación local completada dentro del alcance aprobado. Rama `recovery/backstage-2-audit-20261021`, sin commit nuevo. La copia previa de 390 archivos se archivó y restauró verificando SHA-256; no constituye un backup de datos. [Revisión de fuentes](evidence/phase-4-source-review.json).

No se desplegó, no se escribieron datos en Atlas, no se inicializaron índices ni se cambiaron secretos. La identidad de BACKSTAGE, portada, shell, módulos, motores y fuentes de datos permanecen. La nueva persistencia de invitaciones es aditiva, dentro de MongoDB.

## B. Cambios

| Área/archivos | Resultado |
| --- | --- |
| `mongoIdentity.service.js`, rutas de auth/users y controlador de usuarios | Invitación manual, aceptación con cuenta destinataria, expiración, uso único, revocación y autorización actual dentro de la transacción. Proteger al último administrador activo e invalidar invitaciones anteriores al revocar membresía. |
| `mongoIndexRegistry.js` | Plan aditivo de colección/índices de invitaciones; sin aplicar. |
| `mongoAudit.service.js`, alias histórico y `platformAudit.service.js` | Cadena compatible y hechos de negocio dentro de la transacción de identidad, activos generales, snapshots y proyectos. |
| `locations.service.js`, controlador, `assets.service.js`, `comparisons.service.js`, `analysis.repository.js` | Reutilización de los repositorios actuales con sesión compartida y auditoría atómica de las operaciones incorporadas. |
| `auditLogs.service.js`, `auditLogger.js` | Ocultar credenciales anidadas, limitar datos retenidos y retirar consultas de la ruta registrada. |
| `App.jsx`, `UsersAdmin.jsx`, `InvitationJoin.jsx` | Invitación/aceptación desde Organización, revocación de acceso y perfil vigente por foco/sondeo. Contexto aislado y cierre local tras revocación. |
| `AuditLogsAdmin.jsx` y CSS propio | Acceso desde Organización → Auditoría; corregir contratos de listado, actor/recurso, integridad y eventos. Ajuste de la cuadrícula para móvil sin cambiar tokens globales. |
| Pruebas, fixtures, harness y CI | Integración HTTP/WebSocket con membresías persistidas en fixture; casos de reversión/credenciales/capacidades y recorrido de UI. CI valida y prepara fuentes; continúa sin publicar. |

[Contratos, alcance preciso y límites](PLATFORM_CORE.md).

## C. Verificación

273 pruebas de backend aprobadas, cero fallos y una integración externa omitida. Diez pruebas nuevas cubren aceptación y autoridad del servidor; vencimiento/revocación/aislamiento; reversión al fallar auditoría; saneamiento anidado; HTTP y WebSocket con token obsoleto; último administrador activo; hechos de activo/análisis/proyecto; invalidación de invitaciones anteriores; retirada de capacidad y registro HTTP sin secretos. [Registro](evidence/phase-4-backend-tests.txt).

26 pruebas de frontend aprobadas. La compilación final transforma 129 módulos y conserva las advertencias anteriores de Vite/CJS y tamaño de MapLibre. No se interpreta la compilación como prueba de rendimiento. [Frontend](evidence/phase-4-frontend-tests.txt), [build](evidence/phase-4-build.txt).

En navegador pasaron 66 comprobaciones: 26 recorridos anteriores, 20 de diseño/accesibilidad, 11 del recorrido de Fase 3 y nueve de Platform Core. Incluyen generar/revocar invitación, cambiar/revocar miembro, mostrar auditoría real según su contrato, actualizar el rol desde el perfil, cerrar sesión revocada y aceptar con cambio de organización. Cero errores de ejecución. [Informe](evidence/phase-4-browser.json).

Se conservan las siete anchuras de las vistas anteriores y hay seis capturas nuevas de invitación, auditoría y aceptación en 390 y 1440 px, sin desbordamiento de página. Son 50 capturas de la ejecución final; tres diagnósticos iniciales permanecen aparte. Se revisaron visualmente invitación móvil y auditoría móvil/escritorio. El navegador usa API y transporte indisponible simulados; la prueba de WebSocket nativo se ejecuta por separado contra el servidor real local y almacenamiento aislado.

Los paquetes locales API y web se prepararon sin vinculación remota y se verificaron por hash. [Resultado](evidence/phase-4-packaging.json). El workflow actualizado aún no se ejecutó en GitHub. Los motores científicos no se modificaron ni se volvieron a ejecutar para esta fase.

## D. Riesgos y límites

La integración usa un fixture MongoDB transaccional; faltan persistencia y concurrencia reales en Atlas de pruebas. El nuevo plan de índices no está aplicado. Los enlaces se comparten manualmente: no existe envío por correo ni verificación automática del buzón. Se preserva el registro actual con workspace propio antes de aceptar una invitación para otra organización.

La auditoría atómica cubre las operaciones enumeradas en Platform Core; las demás rutas históricas conservan el middleware posterior a la respuesta. Los hechos nuevos no se presentan como ejecución operativa completada. El WebSocket nativo local no certifica soporte de conexiones persistentes en el hosting productivo; existe sondeo.

El snapshot protege fuentes/configuración no secreta, no datos. El repositorio ya tenía cambios amplios antes de esta fase; cualquier reversión debe ser selectiva. [Procedimiento](ROLLBACK.md).

## E. Siguiente incremento propuesto

Validación integrada en Atlas de pruebas antes de publicar: revisar/aplicar únicamente el delta necesario de invitaciones, usar una organización de prueba identificada, ejecutar invitación → aceptación → cambio de rol → revocación con sesiones separadas y verificar auditoría, concurrencia y reversión ante fallos.

Dependencias: autorizar esas escrituras concretas y disponer de respaldo/restauración comprobables. Riesgos: configuración de índices, diferencias entre fixture y transacciones reales y soporte de transporte en staging. Aceptación: datos releídos desde otra sesión, aceptación simultánea sin duplicados, revocación efectiva y cadena íntegra tras recuperación. No se ejecutó ese incremento ni se desplegó la recuperación. La Fase 5 de Intelligence Core continúa en la hoja de ruta.
