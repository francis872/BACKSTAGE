> Actualización: Atlas de pruebas, esquema v2, transacciones, flujos sanitarios y TTL real ya verificados; [evidencia vigente](evidence/soi-mongo-live.json). Las menciones de conexión pendiente debajo son históricas. No hay proveedor GPS real.

# MongoDB GPS and authorized fleet telemetry



Trips retain explicit current consent, owner, organization, retention period, authorized_device source and operation linkage. Browser GPS is always the consenting user's trajectory. Passing vehicle_id to trip creation never assigns that trajectory to a vehicle. Trip reads and writes constrain organization/user/ID and unexpired consent. At most one open trip per owner is protected by a unique partial index. ACTIVE/PAUSED/INTERRUPTED remain open; COMPLETED/CANCELLED close the slot. CAS filters include version and previous state. Position batches, distance increments and version increments commit together, so an invalid point or impossible movement rolls back the entire batch. Positions require WGS84 numeric coordinates, accuracy 0-100 m and timestamps within 60 seconds of the server clock. Points before consent are rejected; old/replayed timestamps do not increment distance. Speed exceeding 80 m/s rejects the batch. This limit is operational signal validation, not a guarantee that a reported point represents physical reality.

Retention is consent-based. New trip and position records have BSON Date expires_at. MongoDB TTL indexes remove expired records asynchronously; API predicates hide them immediately. Existing historical records without explicit expires_at are untouched. Closing a trip does not extend its expiry. The script backend/scripts/soi-gps-retention.js defaults to PLAN and never connects in that mode. Its --apply option deletes only expired consented records within a transaction and should only run in an authorized environment. The trip-owner cleanup endpoint deletes only that owner's expired records. TTL deletion is eventual and dependent on the indexes having been initialized; do not claim exact-time physical erasure or completion of staging validation.

## Fleet API

Mount routes/soiFleet.routes.js at /soi/fleet. Every endpoint uses fresh organization membership and requires fleet capability. Readers: admin/analyst/viewer. All source registration, source activation and ingestion writes require admin.

- GET /sources returns organization sources with no integration secrets.
- POST /sources accepts name, provider, authorization_reference, consent:true, retention_days (integer 1-365), data_type:EXTERNAL_API. The server records the authorizing administrator and time. The response explicitly labels verification ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED. Registration asserts that the organization has authorized a source; it does not independently verify the external provider.
- PATCH /sources/:id accepts active:boolean. Deactivation prevents ingestion and the status view omits its latest position. Existing retained history remains subject to the original consent period.
- POST /vehicles/:id/positions accepts source_id, consent:true and 1-100 positions with event_id, longitude, latitude, accuracy_m, recorded_at. The source and vehicle must both belong to the active organization; the source must be active and EXTERNAL_API. Events must not predate source consent. The same freshness, accuracy and speed validation as trip GPS applies. Repeating an identical event returns a duplicate count; reusing an event identifier with different content fails 409. Unknown payload fields are discarded.
- GET /vehicles/:id/positions?after=0 returns {data,next}, in numerical position_id order, up to 1000 retained records per page.
- GET /status returns {data,calculated_at,freshness_seconds:120,location_origin:AUTHORIZED_EXTERNAL_INTEGRATION}. Each vehicle has latest_position, source and transmission_status RECENT, STALE or NO_AUTHORIZED_TRANSMISSION. No positions are invented for unconnected vehicles. The status endpoint is a snapshot, not a push subscription or guaranteed continuous connection.

Source revocation and ingestion both update the source document version inside a transaction. Ingestion also writes the vehicle to serialize overlapping batches from different sources. Point insertion, source authorization check and vehicle check cannot commit separately. Sources contain no private provider tokens; ingestion currently uses an authenticated administrator bearer session. A machine-specific integration credential system is not implemented and should be provisioned before unattended provider ingestion.

## Index contract

Shared infrastructure must initialize unique numerical IDs; trips unique {organization_id,user_id} partial {open:true}; trip points unique {organization_id,trip_id,recorded_at}; vehicle positions unique {organization_id,vehicle_id,source_id,event_id}; tenant/vehicle/time indexes for latest position and tenant/vehicle/position_id for history; TTL {expires_at:1} expireAfterSeconds:0 on trips, trip points and vehicle positions. Trip history should have {organization_id,user_id,trip_id,point_id}. Source reads use {organization_id,active} and unique source_id. Infrastructure owns the final definitions; no indexes have been applied to any real database by this work.

## Verification

