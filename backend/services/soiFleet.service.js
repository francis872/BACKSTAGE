const ApiError = require('../utils/ApiError');
const { gpsPoint, identifier } = require('./soiTrips.service');
const DAY = 86400000;
const shortText = (value, maximum = 240) => { if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new ApiError(400, 'Texto de fuente invalido.'); return value.trim(); };
function createFleetService({ database, transaction, nextId, now = Date.now } = {}) {
  const infrastructure = () => require('../infrastructure/soiMongo');
  const db = async () => database || infrastructure().getMongoDatabase();
  const tx = (fn) => transaction ? transaction(fn) : infrastructure().withMongoTransaction(fn);
  const id = (kind, session) => nextId ? nextId(kind, session) : infrastructure().nextId(kind, session);
  const clean = (value) => { if (!value) return value; const { _id, ...row } = value; return row; };
  async function capability(org, store, session) {
    const config = await (store || await db()).collection('soi_configuration').findOne({ organization_id: identifier(org) }, { session });
    if (!config?.capabilities?.includes('fleet')) throw new ApiError(409, 'La capacidad fleet no esta habilitada.');
  }
  const sourceFields = (row) => ({ source_id: row.source_id, organization_id: row.organization_id, name: row.name, provider: row.provider, authorization_reference: row.authorization_reference, active: row.active, retention_days: row.retention_days, consented_at: row.consented_at, created_at: row.created_at, data_type: row.data_type, verification: row.verification });
  async function sources(org) {
    await capability(org);
    return (await (await db()).collection('soi_fleet_sources').find({ organization_id: identifier(org) }).sort({ source_id: -1 }).limit(100).toArray()).map(sourceFields);
  }
  async function createSource(org, user, body) {
    if (body?.consent !== true || body.data_type !== 'EXTERNAL_API') throw new ApiError(400, 'Registra autorizacion expresa y tipo EXTERNAL_API.');
    const retention = Number(body.retention_days);
    if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new ApiError(400, 'La retencion debe ser entre 1 y 365 dias.');
    const fields = { name: shortText(body.name), provider: shortText(body.provider), authorization_reference: shortText(body.authorization_reference, 1000) };
    return tx(async (store, session) => {
      await capability(org, store, session);
      const row = { ...fields, source_id: await id('soi_fleet_sources', session), organization_id: identifier(org), created_by: identifier(user), consented_by: identifier(user), consented_at: new Date(now()), created_at: new Date(now()), updated_at: new Date(now()), active: true, retention_days: retention, data_type: 'EXTERNAL_API', verification: 'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED', version: 1 };
      await store.collection('soi_fleet_sources').insertOne(row, { session });
      return sourceFields(row);
    });
  }
  async function updateSource(org, sourceId, body) {
    if (typeof body?.active !== 'boolean') throw new ApiError(400, 'Indica active verdadero o falso.');
    return tx(async (store, session) => {
      await capability(org, store, session);
      const row = await store.collection('soi_fleet_sources').findOneAndUpdate({ organization_id: identifier(org), source_id: identifier(sourceId) }, { $set: { active: body.active, updated_at: new Date(now()) }, $inc: { version: 1 } }, { session, returnDocument: 'after', includeResultMetadata: false });
      if (!row) throw new ApiError(404, 'Fuente no disponible.');
      return sourceFields(row);
    });
  }
  async function vehicle(store, session, org, vehicleId) {
    const row = await store.collection('soi_vehicles').findOne({ organization_id: identifier(org), vehicle_id: identifier(vehicleId) }, { session });
    if (!row) throw new ApiError(404, 'Vehiculo no disponible.');
    return row;
  }
  async function ingest(org, user, vehicleId, body) {
    if (body?.consent !== true || !Array.isArray(body.positions) || body.positions.length < 1 || body.positions.length > 100) throw new ApiError(400, 'Envia consentimiento y entre 1 y 100 posiciones de la integracion autorizada.');
    const sourceId = identifier(body.source_id);
    const points = body.positions.map((point) => {
      const optional={};for(const[key,max]of[['speed_mps',80],['heading_deg',360],['odometer_km',1e9],['fuel_l',1e6]])if(point[key]!==undefined){if(typeof point[key]!=='number'||!Number.isFinite(point[key])||point[key]<0||point[key]>max)throw new ApiError(400,`${key} fuera de rango.`);optional[key]=point[key];}
      if(point.ignition!==undefined){if(typeof point.ignition!=='boolean')throw new ApiError(400,'ignition requiere booleano.');optional.ignition=point.ignition;}
      return{...gpsPoint(point,now()),event_id:shortText(point.event_id,160),...optional};
    }).sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at));
    if (new Set(points.map((p) => p.event_id)).size !== points.length) throw new ApiError(400, 'Los identificadores de evento deben ser unicos por lote.');
    return tx(async (store, session) => {
      await capability(org, store, session);
      const unit = await vehicle(store, session, org, vehicleId);
      const source = await store.collection('soi_fleet_sources').findOne({ organization_id: identifier(org), source_id: sourceId, active: true, data_type: 'EXTERNAL_API' }, { session });
      if (!source?.consented_at) throw new ApiError(404, 'Fuente autorizada no disponible.');
      const rows = [];
      let previous = await store.collection('soi_vehicle_positions').findOne({ organization_id: identifier(org), vehicle_id: identifier(vehicleId), source_id: sourceId, expires_at: { $gt: new Date(now()) } }, { session, sort: { recorded_at: -1 } });
      for (const point of points) {
        if (Date.parse(point.recorded_at) < new Date(source.consented_at).getTime()) throw new ApiError(400, 'El evento precede al consentimiento de la fuente.');
        const key = { organization_id: identifier(org), vehicle_id: identifier(vehicleId), source_id: sourceId, event_id: point.event_id };
        const duplicate = await store.collection('soi_vehicle_positions').findOne(key, { session });
        if (duplicate) {
          if (duplicate.longitude !== point.longitude || duplicate.latitude !== point.latitude || duplicate.accuracy_m !== point.accuracy_m || new Date(duplicate.recorded_at).getTime() !== Date.parse(point.recorded_at)) throw new ApiError(409, 'Un evento existente tiene datos distintos.');
          if(['speed_mps','heading_deg','ignition','odometer_km','fuel_l'].some(key=>duplicate[key]!==point[key]))throw new ApiError(409,'El evento existente tiene telemetría distinta.');
          continue;
        }
        if (previous && Date.parse(point.recorded_at) <= new Date(previous.recorded_at).getTime()) throw new ApiError(409, 'La fuente envio posiciones fuera de secuencia.');
        if (previous) {
          const distance = require('./soiGeo.service').haversine([previous.longitude, previous.latitude], [point.longitude, point.latitude]);
          const seconds = (Date.parse(point.recorded_at) - new Date(previous.recorded_at).getTime()) / 1000;
          if (distance / seconds > 80) throw new ApiError(422, 'Salto de telemetria superior a 80 m/s.');
        }
        const row = { ...key, longitude: point.longitude, latitude: point.latitude, accuracy_m: point.accuracy_m, recorded_at: new Date(point.recorded_at), received_at: new Date(now()), position_id: await id('soi_vehicle_positions', session), expires_at: new Date(Date.parse(point.recorded_at) + source.retention_days * DAY), data_type: 'EXTERNAL_API', provider: source.provider, ingested_by: identifier(user), verification: source.verification };
        for(const field of ['speed_mps','heading_deg','ignition','odometer_km','fuel_l'])if(point[field]!==undefined)row[field]=point[field];
        rows.push(row); previous = row;
      }
      if (rows.length) {
        // Serialize ingestion against source revocation and simultaneous vehicle updates.
        const updated = await store.collection('soi_fleet_sources').updateOne({ organization_id: identifier(org), source_id: sourceId, active: true, version: source.version }, { $inc: { version: 1 }, $set: { updated_at: new Date(now()) } }, { session });
        if (updated.matchedCount !== 1) throw new ApiError(409, 'La autorizacion de la fuente cambio durante la ingesta.');
        const current = await store.collection('soi_vehicles').updateOne({ organization_id: identifier(org), vehicle_id: unit.vehicle_id }, { $inc: { telemetry_version: 1 } }, { session });
        if (current.matchedCount !== 1) throw new ApiError(409, 'El vehiculo cambio durante la ingesta.');
        await store.collection('soi_vehicle_positions').insertMany(rows, { session, ordered: true });
      }
      return { inserted: rows.length, duplicates: points.length - rows.length, vehicle_id: identifier(vehicleId), source_id: sourceId, data_type: 'EXTERNAL_API' };
    });
  }
  async function positions(org, vehicleId, after = 0) {
    const cursor = Number(after);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new ApiError(400, 'Cursor invalido.');
    return tx(async (store, session) => {
      await capability(org, store, session); await vehicle(store, session, org, vehicleId);
      const rows = await store.collection('soi_vehicle_positions').find({ organization_id: identifier(org), vehicle_id: identifier(vehicleId), position_id: { $gt: cursor }, expires_at: { $gt: new Date(now()) } }, { session }).sort({ position_id: 1 }).limit(1000).toArray();
      return { data: rows.map(clean), next: rows.length === 1000 ? rows.at(-1).position_id : null };
    });
  }
  async function status(org) {
    await capability(org); const store = await db();
    const units = await store.collection('soi_vehicles').find({ organization_id: identifier(org) }).sort({ vehicle_id: 1 }).limit(500).toArray();
    const data = [];
    for (const unit of units) {
      const latest = await store.collection('soi_vehicle_positions').findOne({ organization_id: identifier(org), vehicle_id: unit.vehicle_id, expires_at: { $gt: new Date(now()) } }, { sort: { recorded_at: -1 } });
      const source = latest ? await store.collection('soi_fleet_sources').findOne({ organization_id: identifier(org), source_id: latest.source_id, active: true }) : null;
      const recent=source&&now()-new Date(latest.recorded_at).getTime()<=120000;
      data.push({ ...clean(unit), latest_position: source ? clean(latest) : null, transmission_status: !source ? 'NO_AUTHORIZED_TRANSMISSION' : recent ? 'RECENT':'STALE',movement_status:!recent?'UNKNOWN':typeof latest.speed_mps==='number'?(latest.speed_mps>.5?'MOVING':'STOPPED'):'POSITION_ONLY',source: source ? sourceFields(source) : null });
    }
    return { data, calculated_at: new Date(now()).toISOString(), freshness_seconds: 120, location_origin: 'AUTHORIZED_EXTERNAL_INTEGRATION' };
  }
  return { sources, createSource, updateSource, ingest, positions, status };
}
module.exports = { createFleetService, service: createFleetService() };
