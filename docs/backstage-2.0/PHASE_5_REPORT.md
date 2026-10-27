# Fase 5 — Intelligence Core: comparación reproducible y proyectos

> Informe del incremento original de comparación. La extensión posterior a finanzas y Monte Carlo, con los despliegues actuales de staging, está en [el informe de motores](PHASE_5_ENGINES_REPORT.md). Los IDs y evidencias de este informe se conservan como historial.

Actualizado el 23 de octubre de 2026; implementación iniciada el 22. Incremento aprobado con «hazlo»: entradas, unidades, fuentes y versión conservadas en Atlas; comprobación numérica y reproducibilidad; integración con el comparador/proyectos; validación en staging. Este informe acredita ese recorrido concreto. La extensión del contrato a todas las familias de motores es un trabajo distinto y no se declara completada.

## A. Resultado

Implementado, desplegado y validado en [BACKSTAGE staging](https://backstage-staging-web.vercel.app), con su protección de Vercel y Atlas de pruebas. Los proyectos originales y dominios de producción no cambiaron. [Despliegues](evidence/phase-5-deployment.json), [postflight independiente](evidence/phase-5-postflight.json).

| Servicio Preview | Despliegue validado |
| --- | --- |
| API `backstage-staging-api` | `dpl_EXcJoTYMZMvGXHQMTCvH3niPkYbv` |
| Web `backstage-staging-web` | `dpl_H32TCaeVvcTepGsqEsSjFfzssFra` |

El comparador guarda un contrato calculado por el servidor, permite comprobar su reproducción y exporta el snapshot persistido. Los proyectos guardan la referencia a la versión y sus huellas. La interfaz distingue el resultado guardado de una edición nueva. Los análisis antiguos conservan el motor anterior y su resultado original.

## B. Cambios y compatibilidad

- `shared/comparison.mjs`, `comparison.v1.mjs`, `comparison.v2.mjs`, `decimal.mjs`: selección explícita de versión, motor anterior congelado y nueva versión decimal. No hay una segunda implementación activa del mismo número de versión para lectura histórica.
- `backend/services/intelligenceContract.service.js`: JSON canónico, SHA-256 de entradas/resultado/fuentes del motor/manifiesto, unidades, procedencia, política numérica e incertidumbre explícita sin estimación inventada.
- `backend/services/comparisons.service.js`, `backend/routes/comparisons.routes.js`: contrato en `soi_comparisons`, replay/export por organización, guardas de integridad para crear proyectos y referencia en `analysis_runs.metadata.analysis_context`.
- `frontend/src/pages/AdvancedComparator.jsx`: clasificación de origen, trazabilidad, comprobación, descarga persistida y lectura del resultado histórico. `RetailZones.jsx` muestra la versión vinculada al proyecto.
- Pruebas `backend/domain/intelligenceCore.test.js` y ampliación de los verificadores de navegador/staging con evidencia separada de Fase 5.

Se preservaron por hash el motor anterior completo, el esquema e índices MongoDB, el shell, la portada orbital y los tokens visuales. No se ejecutó una migración ni se renumeraron IDs. El guardado nuevo permanece en las colecciones existentes; los importes se conservan como cadenas decimales canónicas. [Revisión de fuentes](evidence/phase-5-source-review.json), [contrato y límites](INTELLIGENCE_CORE.md).

El motor v2 usa fracciones exactas para comparar cantidades, restricciones, rangos y pesos. Admite 34 cifras significativas y 18 decimales, rechaza números JSON inseguros y conserva los importes de texto. El total se suma antes de redondear a ocho decimales. Las contribuciones visibles se redondean individualmente; pueden sumar una última cifra diferente al total. Las unidades o monedas diferentes se rechazan; no se convierten automáticamente.

## C. Verificación

**Local:** 289 pruebas backend aprobadas y una integración externa omitida; 26 pruebas frontend; BSIE 27, sanitario 11, RPC científico 1 y probabilidad 6, todas aprobadas. Las suites incluyen los motores financieros y matemáticos conservados. El frontend final compiló 132 módulos. [Resumen](evidence/phase-5-regression.json), [build](evidence/phase-5-build.txt).

Las trece pruebas del contrato se revalidaron el 23/10 con el control final de registros históricos inválidos: [salida de la reanudación](evidence/phase-5-resume-focused-tests.txt). La regresión completa y las suites científicas citadas se ejecutaron el 22/10; las fuentes de sus motores se conservaron.

Las trece pruebas nuevas cubren centavos fuera del rango entero seguro, casos ponderados conocidos y transformaciones afines, restricciones decimales, ausentes/empates, redondeo, rechazo de unidades incompatibles, contrato del servidor, exportación, alteración de entradas/resultados/metadatos, versiones antiguas/desconocidas, idempotencia, tenant/rol y rollback transaccional.

**Navegador local con fixtures declarados:** 26 recorridos existentes, 20 comprobaciones de diseño, 11 de contexto/proyectos y 9 de Platform Core; 35 vistas en tamaños de pantalla, sin excepciones. No sustituye la prueba integrada. [Evidencia](evidence/phase-5-browser.json).

**Staging real:** doce grupos aprobados, 76 respuestas de API observadas en dos navegadores Chrome, sin interceptar APIs y sin excepciones de runtime. [Ejecución completa](evidence/phase-5-live.json).

| Caso integrado | Resultado |
| --- | --- |
| Protección, login y proxy | Acceso anónimo al despliegue rechazado; formulario real y `/auth/me`; MongoDB y request ID confirmados a través del proxy |
| Territorio/activo | Ubicación del dispositivo deliberadamente emulada `[0,0]`; activo guardado desde UI y releído en Atlas |
| Precisión y reproducibilidad | Importes `9007199254740992.01` y `.02` conservados exactamente; puntuaciones conocidas 100 y 0; botón de reproducción confirmado; unidad incompatible rechazada con 400 |
| Exportación | Descarga efectuada por Chrome; archivo con snapshot, huellas e informe verificado, sin usar el borrador como sustituto |
| Proyecto | Referencia al manifiesto, territorio y dos activos conservados; recuperación/recarga y reintento sin duplicación |
| Histórico | Registro de ensayo v1 insertado únicamente en el tenant temporal; UI conserva versión/resultado y devuelve `legacy_replayed`, sin completar huellas ni alterar el documento |
| Histórico inválido | Un registro v1 con criterios inválidos devuelve `invalid_input`, `verified:false` y HTTP 409 al intentar crear proyecto; el número de proyectos no aumenta |
| Identidad | Invitación/aceptación, cambio de rol, JWT obsoleto, revocación y conservación de la otra organización comprobados de nuevo |
| Aislamiento | Proyecto, replay y exportación del tenant ajeno devuelven 404; permisos vigentes se conservan |
| Auditoría y transporte | Cadena completa válida con 21 eventos en el momento de lectura; sondeo real HTTP 200; RPC Python protegido válido y solicitud sin HMAC rechazada |

Después de retirar los datos del ensayo, otro proceso recalculó el archivo descargado en el navegador y confirmó las mismas huellas de entradas, resultado, motor y manifiesto. [Prueba independiente](evidence/phase-5-replay-proof.json). Se conservaron nueve capturas reales, incluida la trazabilidad a 390 y 1440 píxeles, en [phase-5-ui](evidence/phase-5-ui/).

Los paquetes desplegados pasaron validación de manifiestos, locks y archivos: API 229 y web 141. [Integridad](evidence/phase-5-packaging.json). Los helpers históricos que publican con `--prod` no se utilizaron. El ensayo final espera el documento nuevo en cada navegación/recarga y las opciones/tarjetas cargadas antes de actuar. Dos intentos previos de la continuación se detuvieron por esas esperas del ensayo, sin cambios de interfaz; sus tenants también se retiraron y se incluyen en el postflight.

## D. Datos, límites y recuperación

Ejecución `atlas-core-20261023210654-b78c59b183c1`. Se crearon solo dos cuentas/organizaciones temporales con correos `example.invalid`; sus activos, comparaciones v1/v2, proyecto, membresías, invitaciones y auditoría organizacional fueron respaldados en BSON privado y retirados. El postflight nuevo confirmó cero filas propias restantes en nueve colecciones afectadas y otras 58 registradas. Los contadores no se retrocedieron. Permanecen cuatro trazas globales de registro/login del ensayo; se conserva la cadena global compartida.

El respaldo privado del ensayo tiene SHA-256 `95d5e8584fd252f0178839783a40fd565a071e70e6a16aca3c80f7dfd56970bf`. No es una copia completa de Atlas ni acredita recuperación a un instante. El snapshot previo de fuentes contiene 458 archivos, con lectura de archivo y hashes comprobados; referencia privada `.vercel/backstage-phase-5-latest.json`.

Las huellas no certifican la veracidad de fuentes ni equivalen a firma digital. Los resultados anteriores sin huellas solo acreditan que su cálculo se puede repetir con el motor conservado. No se estima incertidumbre estadística donde no existe un modelo para hacerlo. El dispositivo fue emulado y no acredita GPS físico. El hosting continúa con HTTP/sondeo; no se habilitó un WebSocket persistente.

Este incremento no implanta contratos nuevos en todos los resultados financieros, probabilísticos, GIS, BSIE u OR-Tools. Sus motores y pruebas existentes se conservaron. El detalle del contrato, límites y formato de exportación está en [Intelligence Core](INTELLIGENCE_CORE.md). [Reversión](ROLLBACK.md).

## E. Continuación

El recorrido aprobado del comparador y proyectos queda disponible en staging. La continuación de Intelligence Core es extender contratos de unidades, versión, semillas/tolerancias y entradas a las demás familias de motores, una por una y con casos numéricos conocidos. Antes de publicar en los proyectos originales permanecen pendientes respaldo completo/restauración, configuración, observabilidad, reversión y autorización de producción.
