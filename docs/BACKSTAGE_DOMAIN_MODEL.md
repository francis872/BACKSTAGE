# BACKSTAGE · modelo de dominio existente y adaptaciones

No se crea un segundo almacén paralelo de proyectos, usuarios o activos.

| Concepto | Fuente de verdad / relación |
| --- | --- |
| Organization / User | `identity_organizations`, `identity_users`, `identity_memberships`; rol por membresía vigente |
| Workspace | Contexto de experiencia por usuario/organización; no una nueva entidad empresarial duplicada |
| Territory / Geometry | Contrato territorial WGS84 y geometrías espaciales/importadas existentes; territorio explorado separado del sitio canónico del proyecto |
| Location / Asset | `locations` y `soi_assets`; identidad compuesta `platform:id` / `soi:id` |
| Project | `analysis_runs` con `metadata.analysis_type=operational_project` |
| Operation / Resource | Capacidades sanitarias y operacionales existentes; referencian su proyecto y organización |
| Event / Observation | Eventos operativos y observaciones de los módulos existentes; procedencia y tiempo según contrato |
| Analysis / Comparison | Motores existentes, `analytics_jobs`, `soi_comparisons` y evidencias versionadas |
| Decision / Evidence | Referencias al análisis y comparación reproducible; se preserva entrada, parámetros y versión |
| Collaboration | `operational_events` con `kind=collaboration.post` o comentario; no convierte todos los eventos técnicos en publicaciones |

Un proyecto puede referenciar varios activos y un activo participar en varios proyectos. La selección no traslada ni duplica la entidad. Vincular una comparación a un proyecto existente actualiza referencias y conserva objetivo, territorio, contexto previo e historial. Una comparación ya vinculada no puede reasignarse silenciosamente a otro proyecto. `analysis_run_id` en la operación de vinculación es un destino explícito: si no existe en la organización devuelve 404; sin ese campo se mantiene la creación de proyecto compatible.

Feed publica texto intencional, con visibilidad privada de la organización por defecto. Compartir exige administración vigente tanto de la organización de origen como de cada destinataria. Los destinatarios ven el texto compartido; no reciben la referencia a un proyecto privado de otra organización. Los comentarios heredan la audiencia y vuelven a comprobar membresías. Un usuario de consulta no publica. Se audita la acción sin duplicar texto o teléfono en el registro de auditoría.

Cuenta permite cambiar nombre/teléfono, no rol, correo de acceso, organización ni contraseña mediante ese formulario. Organización administra membresías e invitaciones. Se impide que un administrador se revoque o degrade a sí mismo y se conserva la protección del último administrador. Un cambio formal de titularidad todavía requiere un mecanismo específico; no se sustituye por una edición libre del rol.

SLA, vigencia de fuentes, excepciones y aprobaciones conservan el motor de reglas existente. Este incremento no convierte valores orientativos en compromisos comerciales aprobados ni redefine responsables. Su cierre comercial y aceptación siguen registrados en el informe de preparación previo.

## Identidad · incremento del 25 de octubre de 2026

`identity_users` incorpora opcionalmente `session_version`, `auth_sessions` (hasta 20 hashes de identificadores con inicio, vencimiento y organización), `auth_actions` (hash, propósito, vencimiento y versión) y `email_verified_at`. La ausencia de versión equivale a cero para compatibilidad. Credenciales nuevas o revocación total incrementan la versión; no se modifica el ID ni la membresía. Los eventos de seguridad se conservan en la auditoría canónica global y la mutación comparte transacción. [Contrato y límites](BACKSTAGE_ACCOUNT_SECURITY.md).

## Flujos computacionales de fase 2

`analytics_jobs.kind=bco.workflow` identifica flujos con autor, organización, revisión, dependencias, huellas de motor/entrada/resultado, retención y estado. Sus eventos tipados y outbox residen en `operational_events`; las fuentes/eventos de integración conservan sus entidades con referencia validada. No se cambian IDs ni se duplica la base por módulo. [Modelo, transiciones y límites](BACKSTAGE_PHASE2_ARCHITECTURE.md), [permisos](BACKSTAGE_PHASE2_PERMISSIONS.md).
