# BACKSTAGE · operación contextual PH y confianza nativa

26 de octubre de 2026, Bogotá. Este incremento amplía el código existente sobre MongoDB Atlas. No publica una versión nueva en Vercel ni cambia producción. Continúa el [NO_GO productivo](BACKSTAGE_PRODUCTION_GO_NO_GO.md).

## Implementación

Las operaciones aparecen dentro de la entidad PH seleccionada en el Explorador, sin navegación adicional. Se reutilizan `locations`, `operational_events`, identidad y auditoría canónicas.

| Operación | Reglas implementadas | Límite |
| --- | --- | --- |
| PQRS | Registro privado, revisión, respuesta y cierre; fecha acordada opcional | No se inventan plazos legales ni SLA aprobados. |
| Reservas | Recursos habilitados, confirmación transaccional sin solapamientos, finalización/cancelación | Reserva exclusiva por objeto; sin aforo compartido ni calendarios externos. |
| Portería | Visita prevista, ingreso y salida con hora del servidor | Registro manual; sin control físico ni identidad civil verificada. |
| Tareas | Trabajo administrativo/mantenimiento, responsable existente opcional y evidencia de finalización | No sustituye compras, contratos o inventario técnico completo. |
| Asambleas | Agenda, apertura tras la hora registrada y cierre con acta aportada | No certifica convocatoria legal, quórum, votos o validez jurídica. |
| Cartera y pagos | Cargos/pagos manuales por unidad, enteros monetarios exactos, límite de saldo y anulaciones auditadas | Sin pasarela, confirmación bancaria, conciliación o facturación electrónica. |
| Presupuesto | Importe y periodo aportados; saldo, recaudado y vencido agrupados por moneda/escala | Sin pronósticos ni optimización todavía. |

Se revalidan rol, sesión y organización. Viewer registra sus PQRS/reservas y consulta su contenido; la disponibilidad ajena no muestra cuerpos privados. Admin/analyst gestionan según catálogo; movimientos financieros y eliminación requieren admin. Recursos de otra organización devuelven ausencia. Las escrituras exigen revisión e idempotencia y auditan en la misma transacción. Pagos/reservas concurrentes compiten bajo bloqueo de objeto. Se impide archivar objetos con operaciones activas o eludir reglas por rutas genéricas.

## Identity, Security y Hebra

La identidad existente incorpora MFA TOTP, configuración probada mediante código, recuperación del segundo factor de un solo uso, desafío temporal tras contraseña y renovación/revocación de sesiones. Un desafío pendiente no sirve como JWT. Cinco fallos bloquean el desafío y producen una alerta interna. La configuración utiliza Cuenta, sin un directorio nuevo.

Security/Hebra aportan envolturas AES-256-GCM por versión, claves de datos aleatorias envueltas, contexto autenticado y compromisos verificables. Importes y fechas financieras permanecen cifrados. Los logs HTTP omiten cuerpos PH/autenticación; las rutas generales de alertas excluyen versiones PH. El historial contextual comprueba las huellas mostradas; la comprobación completa de cadena es separada.

La eliminación autorizada retira envolturas y claves de datos de todas las versiones de un registro no financiero cerrado. Conserva referencias técnicas; un comando antiguo no lo resucita. No borra respaldos/exportaciones ni certifica anonimización total.

[Decisiones arquitectónicas](BACKSTAGE_NATIVE_TRUST_ARCHITECTURE.md). SATYA, Vault y Sincronía no son dependencias ni adaptadores pendientes. No se añadieron paquetes, algoritmos criptográficos propios o Docker.

## Configuración

`HEBRA_ENCRYPTION_KEYS` contiene un objeto JSON de identificadores a claves aleatorias de 32 bytes en base64; `HEBRA_ACTIVE_KEY_ID` selecciona una. Son secretos exclusivos del servidor, nunca `VITE_*`. Los ejemplos los dejan vacíos. No se generaron credenciales de producción ni se configuraron claves en Vercel.

Sin claves válidas se bloquean escrituras sensibles y nuevas activaciones MFA; la interfaz lo explica. Perder una clave histórica impide leer sus datos. Custodia, distribución entre instancias, recuperación, rotación y retención deben probarse antes de habilitar producción. Los códigos MFA recuperan el segundo factor, no una contraseña olvidada; el envío de recuperación por correo continúa sin proveedor.

## Verificación

Regresión: **417 pruebas backend, 416 aprobadas y una omitida; 36 frontend aprobadas; build aprobado**. Evidencias: [backend](evidence/unified-operations-backend-tests.txt), [frontend](evidence/unified-operations-frontend-tests.txt), [build](evidence/unified-operations-build.txt), [aceptación Atlas/navegador](evidence/unified-operations-live.json) y [comprobación final](evidence/unified-operations-postflight.json).

La integración emplea API nativa local, Chrome ya instalado y una base exclusiva nueva en Atlas de pruebas, con marcador de propiedad y limpieza comprobada. Usa claves efímeras e identidades/datos sintéticos. Verifica aislamiento, pagos/reservas concurrentes, versiones cifradas, eliminación, desafío MFA, consumo concurrente y rechazo de reutilización de códigos. El navegador recorre jerarquía, edición, PQRS/respuesta/cierre/eliminación, archivo, roles, anchos 320/390/1440 y configuración/acceso con segundo factor.

Se conservan informes de los primeros intentos fallidos: detectaron carreras en las esperas del navegador y en la presentación tras eliminar contenido. Se corrigió la actualización para mostrar directamente el resultado. Un intento frontend bajo sandbox no resolvió directorios de esbuild; la repetición autorizada fuera de ese límite pasó con los mismos archivos.

No se validan proveedores cartográficos ni representación WebGL; las solicitudes externas se bloquean en este ensayo. No equivale a carga empresarial, auditoría externa de seguridad o aceptación observada con usuarios sin experiencia.

## Pendientes

Integración contextual de matemáticas espaciales, sostenibilidad/optimización/proyecciones económicas, diccionario/evaluador normativo de Colombia, Community, Colab, documentos generales Hebra y firmas cuando correspondan. [Plan vigente](BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md).

Producción requiere Atlas separado y credenciales mínimas verificadas, backup programado/restauración aislada, custodia de claves, monitor independiente con alerta recibida, capacidad, recorridos y reversión de esta versión. No se afirma que correo, GPS, fuentes satelitales configuradas, identidad civil, firmas digitales, IPFS o blockchain estén activos por disponer de esta base.
