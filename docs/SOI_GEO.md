# SOI: geographic services and road intelligence

The router is mounted at `/api/soi/geo`. All endpoints require authentication,
fresh organization membership and admin, analyst or viewer permissions. Creating
a saved route requires admin or analyst. No paid provider or key is enabled here.

| Method | Path | Input | Output |
| --- | --- | --- | --- |
| GET | `/capabilities` | none | `{autocomplete,profiles,elevation,surface}` configured capabilities |
| GET | `/geocode` | `q`, optional `countryBias`, `regionBias`, `viewbox=west,south,east,north`, `bounded=true`, `limit=1..5` | `{results,source,validation}` |
| GET | `/autocomplete` | `q`, optional `limit=1..5` | `{results,source}`; 503 until Photon is configured |
| GET | `/reverse` | `lng`, `lat`, optional `zoom=0..18` | `{result,requestedCoordinates,source,validation}` |
| POST | `/routes` | `{coordinates:[[lng,lat],...],profile:'driving',alternatives:true}` | `{routes,waypoints,requestedCoordinates,profile,source,validation}` |
| GET | `/elevation` | `lng`, `lat` | `{coordinates,elevationM,source,precision,validation}` |
| POST | `/profile` | `{coordinates:[[lng,lat],...],samples:50}` | `{samples,distanceM,ascentM,descentM,source,precision,validation}` |
| GET | `/surface` | `bbox=west,south,east,north`, optional `resolution=8` | `{bbox,resolution,elevation,slope,aspect,curvature,contours,statistics,dataMode,source,precision,provenance}` |
| POST | `/route-plans` | route body plus `name`, optional `operation_id` | 201 `{data:{route_plan_id,...}}` |
| GET | `/route-plans` | optional `limit=1..100` | `{data:[...]}` |
| GET | `/route-plans/:id` | positive integer ID | `{data:{...,result}}` |

Coordinates always follow GeoJSON WGS84 longitude, latitude order. Bounds and
empty values are validated. Place precision is a provider feature category,
not verified address accuracy: `accuracyM` remains null. Reverse lookup returns
the nearest provider feature separately from the requested point. The existing
territory resolver is reused, including its Nominatim cache, explicit-country
handling, timeout and public-provider shared MongoDB rate lease.
An explicit search `-80.1918,25.7617` resolves locally without network access and
reports `precision.level=user_coordinates`, source `user_provided` and address
validation `not_geocoded`. Enter longitude first, latitude second.

Nominatim public search must only run after explicit search submission. Its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) forbids
autocomplete. Set `SOI_PHOTON_URL` to an authorized Photon API endpoint for
autocomplete; it never falls back to Nominatim. Geocoding source attribution must
remain visible when displaying matches.

OSRM returns actual road geometry, ordered intermediate stops (2–25 points),
distance in meters, estimated duration in seconds, alternatives when available,
legs and maneuver steps. Missing roads or provider failure return 422/503; there
is no straight-line route fallback. Alternatives are not guaranteed. Traffic is
explicitly `not_live`. `SOI_OSRM_DRIVING_URL` defaults to the public OSRM demo
server; production should use an authorized deployment with appropriate capacity.
`SOI_OSRM_WALKING_URL` and `SOI_OSRM_CYCLING_URL` are disabled until configured.
Each server must actually be preprocessed with the corresponding Lua profile:
changing the URL profile token does not change OSRM's underlying model.
See [OSRM routing API](https://project-osrm.org/docs/v5.5.1/api/) and
[OSRM profiles](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/profiles.md).

Elevation uses the real Open-Meteo/Copernicus GLO-90 endpoint, configurable with
`SOI_ELEVATION_URL` (default `https://api.open-meteo.com/v1/elevation`). Source
resolution is approximately 90 m; vertical accuracy is not asserted. Surface
samples a 2–10 square grid (default 8, at most 100 upstream points). It returns
DEM-derived elevation, slope and contours compatible with Explorer. Slope uses
separate east/west and north/south cell distances; curvature remains the existing
square-cell approximation and is labeled accordingly. Latitude range for surface
is -85..85. Profiles follow the supplied polyline with 2–100 samples and at most
10,000 input points. Profiles do not compute a road route automatically: pass
returned road geometry to analyze that route. Sample ascent/descent is sensitive
to spacing. Neither surface nor profile validates hydrology, flooding, surveyed
terrain or geological conditions. DEM errors return 502/503; no synthetic grid is
substituted. See [Open-Meteo elevation](https://open-meteo.com/en/docs/elevation-api)
for attribution, coverage and use terms; operational use must satisfy those terms.

Surface cache is organization scoped, bounded to 100 entries and expires after
five minutes. Each process enforces 30 provider operations and 1,000 DEM samples
per organization per minute, returning 429 before excessive calls. A multi-instance
production service additionally needs a shared gateway quota; the local limiter
does not claim application-wide enforcement. Profile/routing bodies are bounded
to 300 KB; global Express payload limits also apply. No caching of failed DEM
results. Surface cache hits do not consume provider quota.

Saved routes require MongoDB via `MONGODB_URI`; database selection is
`MONGODB_DB`, then `MONGODB_SPATIAL_DB`, then `backstage_spatial`.
Runtime uses `soi_route_plans` and tenant-scoped `soi_operations` collections.
The server recomputes OSRM results on save,
ignores client-provided results, validates optional operation ownership and scopes
every read/write to the current organization. Saving uses a MongoDB transaction
and checks operation ownership again inside it. Numeric API IDs come from shared
MongoDB counters; internal `_id` values are omitted from responses.
Saved results are bounded to 5 MB. List
responses omit geometry results; use the detail endpoint to load a saved route.
The earlier `1680000021000_add_soi_route_plans.js` remains a legacy migration
artifact and is not required by the MongoDB implementation.

Initialize MongoDB indexes using the infrastructure's explicit initialization
workflow before enabling writes. Required route indexes are unique
`{route_plan_id:1}` and `{organization_id:1,route_plan_id:-1}`. Module import does
not create collections or indexes automatically.

Public Nominatim is serialized across instances with a shared
`soi_provider_locks` document (`_id=nominatim-public`). Atomic acquisition sets a
30-second crash lease; completion leaves a minimum one-second cooldown. A busy
lease returns 503 before contacting Nominatim. MongoDB unavailability fails closed;
uses MongoDB's built-in unique `_id` index and no TTL deletion. Cache hits bypass
provider requests. Application-wide public-provider throughput must remain within
the Nominatim policy; these locks are separate from per-process SOI DEM quotas.

## Validation

Isolated tests (no network, no database, explicit provider fixtures):

```powershell
node --test backend/services/soiGeo.service.test.js
node --test backend/services/territoryResolver.mongo.test.js
```

Opt-in public network check, real Miami–Los Angeles coordinates:

```powershell
$env:SOI_LIVE_GEO_TEST='1'
node --test backend/services/soiGeo.service.test.js
Remove-Item Env:SOI_LIVE_GEO_TEST
```

The integration test checks 3,500–6,000 km of road distance, duration, more than
100 geometry points and more than 10 maneuver steps. It prints observed provider
metrics on success. Do not confuse the isolated Miami/LA fixture with a successful
live route. An initial sandbox attempt returned 503; a later approved real HTTP
verification by the coordinating agent succeeded at `2026-10-20T15:42:46.242Z`:
4,399,798.2 meters, 172,815.6 seconds, 22,105 geometry points, 69 maneuvers and one
alternative. Evidence is saved in `docs/evidence/soi-miami-la-live.json`; the
reproducible script is `backend/scripts/verify-soi-miami-la.js`. These figures
verify that road route at observation time. A real DEM surface verification also
succeeded at `2026-10-20T15:46:22.849Z`: 16 elevation samples between 1,775 and
3,006 m and 15 contour levels, over bbox `[-105.4,39.6,-105.2,39.8]`. Evidence is
saved in `docs/evidence/soi-dem-live.json`. This verifies model elevation retrieval
and derived terrain fields; physical GPS devices and browser 3D rendering remain
outside those checks.

Isolated HTTP security tests use signed fixture JWTs and injected membership and
service repositories, with no database or external provider calls:

```powershell
node --test backend/routes/soiGeo.routes.test.js
```

They verify fresh viewer permissions, explicit organization selection, revoked
membership, source preservation, actionable provider 503 responses and opaque
infrastructure errors even with an unsafe development error handler downstream.
