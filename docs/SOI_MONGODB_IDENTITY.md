> Actualización: Atlas de pruebas, esquema v2, transacciones, flujos sanitarios y TTL real ya verificados; [evidencia vigente](evidence/soi-mongo-live.json). Las menciones de conexión pendiente debajo son históricas. No hay proveedor GPS real.

# Identidad MongoDB de Backstage/SOI


Se reutiliza `infrastructure/soiMongo.js`: `getMongoDatabase()`, `withMongoTransaction((db,session)=>...)`, `nextId(collection,session)`. La base se resuelve por `MONGODB_DB || MONGODB_SPATIAL_DB || backstage_spatial`. El cliente, conexión y esquema son responsabilidad de esa infraestructura; no se mantiene una conexión separada para identidad.

Colecciones e índices incluidos en el manifiesto de inicialización:

- `identity_users`: user_id numérico único, email normalizado único, nombre, hash bcrypt, timestamps. Nunca devuelve hash ni _id en las APIs.
- `identity_organizations`: organization_id numérico único, slug único, nombre y estado activo; membership_revision serializa cambios de administradores.
- `identity_memberships`: combinación organization_id/user_id única; role admin, analyst o viewer. display_name es un nombre visible dentro de esa organización.

La inicialización se revisa con el plan offline de la infraestructura y se aplica explícitamente en un entorno autorizado. `initializeIdentityIndexes()` es una función idempotente de soporte para los índices de identidad; no crea cuentas ni sustituye la inicialización del esquema completo. La infraestructura exige marcador de versión antes del runtime. Las mutaciones utilizan sesiones y transacciones: se requiere Atlas o replica set, sin degradación silenciosa a operaciones parcialmente confirmadas.

`POST /auth/register` conserva el contrato name/email/password/organization_name y crea atómicamente una organización, cuenta y membresía admin. Rechaza elegir un rol u organización existentes. `POST /auth/login`, `GET /auth/me`, `GET /auth/organizations` y `POST /auth/switch-organization` mantienen las envolturas previas, JWT e IDs numéricos. El JWT no convierte sus membresías históricas en autorización vigente: los endpoints SOI y `/users` consultan membresías actuales de MongoDB.

Administración de usuarios: solo un administrador actual de la organización puede acceder a `/users`. Crear una cuenta con email que ya pertenece a una cuenta global devuelve 409: incorporar esa cuenta requiere un flujo de invitación consentida, que aún no está implementado. Una edición de nombre modifica display_name local; no cambia nombres de otras empresas. Cambiar rol y revocar membresía afectan solo a la organización seleccionada. Se impide quitar o degradar el último administrador y se serializan estas modificaciones mediante revisión de la organización dentro de la transacción. Eliminar desde `/users` revoca la membresía y conserva la cuenta global y sus otras membresías. Los administradores no pueden restablecer la contraseña global de una cuenta multiempresa; requiere recuperación por su titular, también pendiente de un flujo dedicado. Para cuentas de una sola organización se conserva la operación administrativa existente.

Las contraseñas nuevas requieren al menos ocho caracteres y como máximo 72 bytes UTF-8 para evitar truncamiento silencioso de bcrypt. Los hashes legacy compatibles se actualizan tras login válido. Los errores inesperados de Mongo se transforman en 503 sin exponer URI, credenciales ni nombres internos de índices. La comprobación fresca de membresías aplica revocaciones y degradaciones de rol; cambiar contraseña no invalida automáticamente todos los JWT ya emitidos, por lo que un flujo futuro de revocación de sesiones requiere versionado de tokens o sesiones persistidas.


