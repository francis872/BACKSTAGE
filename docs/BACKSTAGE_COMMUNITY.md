# Backstage Community · conocimiento contextual

Incremento del 26 de octubre de 2026, Bogotá. Extensión del Explorador Territorial, sin destino nuevo en la navegación. **Aceptado técnicamente con los límites de este informe y posteriormente publicado solo en Preview protegido. Producción conserva su versión anterior.** [Acceso y validación remota](BACKSTAGE_COMMUNITY_PREVIEW.md).

Resultado: **464 pruebas backend aprobadas y una omitida; 41 frontend y compilación aprobadas. Ocho comprobaciones Community en Atlas, ocho de regresión normativa, ocho económicas y veintitrés de navegador aprobadas**, incluyendo PH, revisión de rol y MFA. Cero errores de ejecución del navegador; cadenas de auditoría verificadas en ambas organizaciones y base sintética exclusiva eliminada. [Aceptación real](evidence/community-live.json), [comprobación final](evidence/community-postflight.json), [ejemplo reproducible](examples/community-knowledge.json), [resultado](examples/community-knowledge-result.json). El recorrido desactiva WebGL y bloquea fuentes cartográficas externas; no acredita renderizado gráfico ni capacidad productiva.

## Auditoría y reutilización

Antes de editar se comprobó la línea base: **455 pruebas backend aprobadas y una omitida; 40 frontend aprobadas**. Se conservaron copias privadas de veinte archivos de los puntos de integración. La conexión autorizada se inspeccionó únicamente por metadatos/conteos; no se utilizaron sus filas operativas. [Auditoría de datos](evidence/community-data-audit.json).

Los documentos normativos existentes ya tienen cifrado, versiones, eliminación y auditoría. Community utiliza **esas mismas familias `normative.record.version`, tipo `document`**, dentro de `operational_events`. Un documento aparece en ambas capacidades cuando corresponde a una copropiedad raíz, sin copiar su texto. El adaptador documental admite también unidades y objetos generales de `locations`; el expediente legal mantiene su restricción a la raíz PH. No se amplió la evaluación jurídica a otros sectores.

`nativeDocumentFormat.js` conserva exactamente la vinculación criptográfica anterior. Identity revalida usuarios, sesiones, organización y membresía. Security/Hebra conserva el cifrado autenticado y los paquetes ya existentes. Los análisis y los acuerdos de acceso son nuevas versiones `community.record.version`, excluidas de las APIs generales de alertas. No hay dependencias nuevas, Docker, directorio alternativo, SATYA, Vault ni proveedor de IA externo.

El Feed de publicaciones/comentarios continúa con su responsabilidad anterior. Community libera documentos seleccionados mediante aprobaciones explícitas de ambas organizaciones. No duplica el cuerpo documental en publicaciones del Feed ni implementa todavía los proyectos formales de Colab.

## Recorrido del usuario

Selecciona un objeto del Explorador. En PH, abre «Operaciones e historial de este objeto» y «Community · Documentos y conocimiento de este lugar». Los activos generales canónicos ofrecen el mismo panel en el inspector. No se asocian documentos a resultados externos de búsqueda sin un objeto organizacional registrado. Los identificadores SOI permanecen en su propio espacio; ese adaptador no está incluido.

Desde el panel se puede buscar por título/texto, filtrar la categoría sugerida, aportar texto o un archivo TXT/MD, consultar versiones, editar conservando historia, revisar frases candidatas y reproducir análisis. Administradores y analistas tienen acceso privado por organización y objeto. El rol de consulta no puede leer este repositorio privado, ni siquiera por API. No se promete una ACL individual por documento que las rutas normativas existentes no aplicarían.

La edición documental invalida los intercambios fijados a la versión anterior. El administrador puede eliminar los contenidos de todas las versiones; se conservan los compromisos y referencias necesarios. La interfaz muestra el efecto antes de confirmar. El cambio de usuario, organización, rol u objeto desmonta el panel, cancela solicitudes y vacía su estado. El texto privado no se guarda en `localStorage`.

## Clasificación y revisión trazable

`shared/communityKnowledge.v1.mjs` es un analizador determinista, versionado y compartido con la interfaz. Cuenta presencia de palabras en seis categorías —reglamento, política, procedimiento, acta, contrato, informe— y permite «sin clasificar». Los empates se resuelven por orden estable de categoría. Las puntuaciones son conteos, **no probabilidades ni precisión medida**. El filtro usa la sugerencia automática; la clasificación humana se conserva aparte.

Las expresiones españolas de deber y prohibición identifican **posibles obligaciones**, con posiciones UTF-16, número de línea y una marca de posible condición/excepción. Se reconoce el texto con tildes y se conserva la referencia aun con caracteres Unicode suplementarios. El candidato se muestra recortando el documento autorizado; el análisis no guarda otra copia de la frase. Segmentar por líneas y signos de puntuación puede perder contexto, abreviaturas o referencias. Una obligación implícita puede no detectarse. El contenido aportado es inerte: no ejecuta instrucciones, no modifica reglas normativas y no genera decisiones legales.

La revisión humana conserva categoría, candidato, decisión, motivo estructurado, responsable y fecha. Una frase confirmada significa «verificada en el texto»; no convierte el documento en ley ni acredita su aplicabilidad. Las nuevas revisiones conservan el resultado automático y las versiones anteriores. El historial se puede consultar desde el panel o API. No se sustituye la revisión normativa designada ni se acredita cualificación profesional.

Cada evidencia enlaza documento/revisión/familia/objeto/compromiso/hash del contenido, huella SHA-256 del código y huella del resultado. Reproducir verifica el analizador y ejecuta otra vez las reglas; no reescribe historia. Si cambia el código se requiere el analizador histórico. Si se elimina el contenido fuente, la reproducción textual deja de estar disponible. No se conservan extractos para eludir esa eliminación.

## Compartición opcional entre organizaciones

1. El administrador de origen selecciona una versión vigente, indica organización destinataria y finalidad, revisa el texto completo y confirma su liberación. Puede fijar una caducidad con zona horaria.
2. El administrador destinatario ve una invitación con metadatos. Aún no puede consultar el texto. Acepta o rechaza desde un objeto propio; la aceptación vincula ese intercambio al objeto.
3. La lectura aceptada revalida organizaciones, objetos, roles, estado, plazo, versión y compromiso de la fuente. Se libera exclusivamente título, texto, clase, revisión, hash y análisis determinista. No se liberan notas normativas, escenarios financieros, otros documentos, comandos ni historias privadas del origen.
4. El origen puede revocar. Una edición/revisión nativa, eliminación, archivo del objeto o desactivación organizacional impide una lectura nueva de la versión liberada. Las referencias y las acciones quedan auditadas; las decisiones del destino figuran en ambas cadenas organizacionales.

Las escrituras y lecturas compartidas usan transacciones MongoDB y bloquean las revisiones de las organizaciones en orden estable para resolver carreras con cambios de permisos, fuente o revocación. Los comandos tienen idempotencia acotada y las modificaciones verifican revisión esperada. Las respuestas privadas usan `Cache-Control: no-store`; las rutas tienen cuota organizacional. El cifrado autentica los campos inmutables de vinculación. Índices parciales mantienen unicidad de comando, revisión, versión vigente y análisis por versión fuente.

**Revocar no retira una copia que alguien ya haya descargado ni borra lo que haya leído.** La aprobación exige revisar el texto completo y la finalidad; no hay anonimización automática ni promesa de protección frente a un destinatario autorizado que copie la información. Las invitaciones se gestionan dentro de la plataforma: no se envían correos ni mensajes externos.

## Contratos y límites

La API se monta en `/api/assets/:id/community`; utiliza la identidad y el encabezado organizacional existentes. [Implementación de rutas](../backend/routes/communityKnowledge.routes.js), [contrato OpenAPI](../backend/infrastructure/communityOpenApi.js).

| Familia de rutas | Operación |
| --- | --- |
| `GET/POST documents`, `GET documents/:record` | Biblioteca y documento canónico, carga/versionado nativo. |
| `GET documents/:record/history`, `POST documents/:record/erase` | Historia y eliminación de contenidos por administrador. |
| `POST documents/:record/analyze` | Revisión estructurada; `prior_id` y `revision` al modificar análisis existente. |
| `GET analyses/:record`, `GET analyses/:record/history`, `POST analyses/:record/reproduce` | Evidencia, versiones y reproducción verificable. |
| `GET/POST shares`, `POST shares/:record/respond`, `GET shares/:record/document` | Invitación, aceptación/rechazo/revocación y lectura liberada. |

Las mutaciones versionadas requieren `Idempotency-Key`. Guardar el documento y analizarlo son dos transacciones: si falla el segundo paso se devuelve el documento guardado y `analysis_status: pending`, con una advertencia y posibilidad de reintento; no se afirma una reversión documental inexistente.

Texto: 40.000 caracteres en API; archivos TXT/MD UTF-8 de hasta 40 KB en interfaz. La carga Community admite hasta 200 documentos activos por objeto, páginas de hasta 50 y 250 candidatos por análisis. Si el expediente canónico preexistente supera doscientos documentos, la biblioteca devuelve 413 y exige acotar/reorganizar, sin descartar silenciosamente resultados. Se muestran hasta 50 versiones históricas y 100 intercambios recientes, con indicador de truncamiento. La transcripción de PDF, imágenes, documentos ofimáticos, OCR, búsqueda semántica, firmas documentales y almacenamiento distribuido/IPFS no están incluidos. Los identificadores del destinatario se introducen explícitamente; no se publica un directorio de organizaciones.

No hay motor generativo, certificación jurídica ni publicación automática. Los datos compartidos son referencias versionadas, sin exportación masiva de la organización. La búsqueda acotada descifra únicamente la biblioteca autorizada del objeto; no se presenta como un índice documental empresarial de escala ilimitada.

## Comprobaciones y continuidad

Pruebas unitarias/integración: Unicode, límites, idempotencia, repositorio nativo único, sesiones/roles/objetos/organizaciones, cifrado e integridad, curación histórica, doble aprobación, revisión de fuente, eliminación, caducidad, revocación y exclusión de alertas. La aceptación real utiliza una base sintética con marcador de propiedad en el Atlas confirmado como pruebas; verifica API y navegador local y elimina solamente esa base al terminar.

Ejecución reproducible, sin publicar:

```text
cd backend
npm test
cd ../frontend
npm test
npm run build
cd ..
node scripts/audit-community-test-data.js
node scripts/verify-horizontal-property.js --apply --community
node scripts/run-community-example.js
node scripts/verify-community-postflight.js
```

El siguiente incremento es **Backstage Colab**: propuestas formales con objetivos, alcance, datos permitidos, responsables, métricas y transiciones auditadas. El intercambio documental de Community será una capacidad reutilizable, sin copiar documentos ni crear navegación paralela. Permanecen pendientes las limitaciones económicas WebGL/adaptadores sectoriales y el cierre operativo de producción: infraestructura, claves, respaldo/restauración, monitoreo, capacidad y reversión. **La publicación posterior se limita a Preview protegido; se conserva NO_GO productivo.**
