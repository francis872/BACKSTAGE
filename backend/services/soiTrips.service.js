const ApiError = require('../utils/ApiError');
const { gpsPoint, transition } = require('./tripValidation');
function identifier(value) {
  if (!['number', 'string'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new ApiError(400, 'Identificador invalido.');
  return Number(value);
}
const DAY = 86400000;
function retentionDays() {
  const value = Number(process.env.SOI_GPS_RETENTION_DAYS || 30);
  if (!Number.isInteger(value) || value < 1 || value > 365) throw new ApiError(503, 'SOI_GPS_RETENTION_DAYS debe estar entre 1 y 365.');
  return value;
}
function createTripsService({ database, transaction, nextId, now = Date.now } = {}) {
  const infrastructure = () => require('../infrastructure/soiMongo');
  const db = async () => database || infrastructure().getMongoDatabase();
  const transact = (fn) => transaction ? transaction(fn) : infrastructure().withMongoTransaction(fn);
  const id = (kind, session) => nextId ? nextId(kind, session) : infrastructure().nextId(kind, session);
  const clean = (value) => { if (!value) return value; const { _id, ...row } = value; return row; };
  const scope = (org, user) => ({ organization_id: identifier(org), user_id: identifier(user) });
  const available = (org, user, tripId) => ({ ...scope(org, user), trip_id: identifier(tripId), expires_at: { $gt: new Date(now()) } });
  async function capability(org, name = 'trips', store, session) {
    const configuration = await (store || await db()).collection('soi_configuration').findOne({ organization_id: identifier(org) }, { session });
    if (!configuration?.capabilities?.includes(name)) throw new ApiError(409, `La capacidad ${name} no esta habilitada para esta organizacion.`);
  }
  async function policy() { return { retentionDays: retentionDays(), tracking: 'foreground_browser', maximumAccuracyM: 100, source: 'authorized_device', access: 'trip_owner', deletion: 'consented_mongodb_ttl_and_owner_cleanup', automaticDeletion: true }; }
  async function list(org, user) {
    await capability(org);
    return (await (await db()).collection('soi_trips').find({ ...scope(org, user), expires_at: { $gt: new Date(now()) } }).sort({ started_at: -1 }).limit(100).toArray()).map(clean);
  }
  async function create(org, user, body) {
    const owner = scope(org, user);
    if (body?.consent !== true || body.retention_days !== retentionDays()) throw new ApiError(400, 'Acepta expresamente la politica vigente de retencion GPS.');
    const operationId = body.operation_id != null && body.operation_id !== '' ? identifier(body.operation_id) : null;
    try {
      return await transact(async (store, session) => {
        await capability(org, 'trips', store, session);
        if (operationId !== null) {
          await capability(org, 'operations', store, session);
          if (!await store.collection('soi_operations').findOne({ organization_id: owner.organization_id, operation_id: operationId }, { session })) throw new ApiError(404, 'Operacion no disponible.');
        }
        const timestamp = new Date(now());
        await store.collection('soi_trips').updateMany({ ...owner, open: true, expires_at: { $lte: timestamp } }, { $set: { state: 'COMPLETED', open: false, ended_at: timestamp, updated_at: timestamp }, $inc: { version: 1 } }, { session });
        if (await store.collection('soi_trips').findOne({ ...owner, open: true }, { session })) throw new ApiError(409, 'Ya existe un viaje abierto. Reanudalo o cierralo.');
        const row = { ...owner, trip_id: await id('soi_trips', session), operation_id: operationId, state: 'ACTIVE', open: true, version: 1, distance_m: 0, retention_days: retentionDays(), consented_at: timestamp, started_at: timestamp, updated_at: timestamp, ended_at: null, expires_at: new Date(now() + retentionDays() * DAY), source: 'authorized_device', data_type: 'ORGANIZATION_PROVIDED' };
        await store.collection('soi_trips').insertOne(row, { session });
        return clean(row);
      });
    } catch (error) { if (error.code === 11000) throw new ApiError(409, 'Ya existe un viaje abierto. Reanudalo o cierralo.'); throw error; }
  }
  async function getTrip(store, session, org, user, tripId) {
    const trip = await store.collection('soi_trips').findOne(available(org, user, tripId), { session });
    if (!trip) throw new ApiError(404, 'Viaje no disponible.');
    return trip;
  }
  async function change(org, user, tripId, body) {
    return transact(async (store, session) => {
      await capability(org, 'trips', store, session);
      const trip = await getTrip(store, session, org, user, tripId);
      transition(trip.state, body?.state);
      const terminal = ['COMPLETED', 'CANCELLED'].includes(body.state);
      const result = await store.collection('soi_trips').findOneAndUpdate({ ...available(org, user, tripId), version: trip.version, state: trip.state }, { $set: { state: body.state, open: !terminal, ended_at: terminal ? new Date(now()) : null, updated_at: new Date(now()) }, $inc: { version: 1 } }, { session, returnDocument: 'after', includeResultMetadata: false });
      if (!result) throw new ApiError(409, 'El viaje cambio concurrentemente. Actualiza y reintenta.');
      return clean(result);
    });
  }
  async function append(org, user, tripId, body) {
    if (!Array.isArray(body?.points) || !body.points.length || body.points.length > 100) throw new ApiError(400, 'Envia entre 1 y 100 posiciones.');
    const points = body.points.map((point) => gpsPoint(point, now())).sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
    return transact(async (store, session) => {
      await capability(org, 'trips', store, session);
      const trip = await getTrip(store, session, org, user, tripId);
      if (trip.state !== 'ACTIVE' || trip.open !== true || !trip.consented_at) throw new ApiError(409, 'El viaje no esta activo o carece de consentimiento.');
      let previous = await store.collection('soi_trip_points').findOne({ organization_id: identifier(org), trip_id: identifier(tripId) }, { session, sort: { recorded_at: -1 } });
      const rows = []; let distanceAddedM = 0;
      for (const point of points) {
        if (Date.parse(point.recorded_at) < new Date(trip.consented_at).getTime()) throw new ApiError(400, 'La posicion precede al consentimiento.');
        if (previous && Date.parse(point.recorded_at) <= new Date(previous.recorded_at).getTime()) continue;
        if (previous) {
          const { haversine } = require('./soiGeo.service');
          const distance = haversine([previous.longitude, previous.latitude], [point.longitude, point.latitude]);
          const seconds = (Date.parse(point.recorded_at) - new Date(previous.recorded_at).getTime()) / 1000;
          if (distance / seconds > 80) throw new ApiError(422, 'El salto GPS supera 80 m/s. Revisa la senal.');
          distanceAddedM += distance;
        }
        const row = { ...point, organization_id: identifier(org), trip_id: identifier(tripId), user_id: identifier(user), point_id: await id('soi_trip_points', session), recorded_at: new Date(point.recorded_at), expires_at: trip.expires_at, source: 'authorized_device', data_type: 'ORGANIZATION_PROVIDED' };
        rows.push(row); previous = row;
      }
      if (rows.length) {
        const updated = await store.collection('soi_trips').updateOne({ ...available(org, user, tripId), state: 'ACTIVE', version: trip.version }, { $inc: { distance_m: distanceAddedM, version: 1 }, $set: { updated_at: new Date(now()) } }, { session });
        if (updated.matchedCount !== 1) throw new ApiError(409, 'El viaje cambio concurrentemente.');
        await store.collection('soi_trip_points').insertMany(rows, { session, ordered: true });
      }
      return { inserted: rows.length, distanceAddedM };
    });
  }
  async function points(org, user, tripId, after = 0) {
    const offset = Number(after);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError(400, 'Cursor invalido.');
    return transact(async (store, session) => {
      await capability(org, 'trips', store, session);
      await getTrip(store, session, org, user, tripId);
      const rows = await store.collection('soi_trip_points').find({ organization_id: identifier(org), trip_id: identifier(tripId), user_id: identifier(user), point_id: { $gt: offset }, expires_at: { $gt: new Date(now()) } }, { session }).sort({ point_id: 1 }).limit(1000).toArray();
      return { data: rows.map(clean), next: rows.length === 1000 ? rows.at(-1).point_id : null };
    });
  }
  async function purgeExpired(org, user) {
    return transact(async (store, session) => {
      const owner = scope(org, user), predicate = { ...owner, expires_at: { $lte: new Date(now()) } };
      const trips = await store.collection('soi_trips').find(predicate, { session }).toArray();
      if (trips.length) await store.collection('soi_trip_points').deleteMany({ ...owner, trip_id: { $in: trips.map((trip) => trip.trip_id) } }, { session });
      const result = await store.collection('soi_trips').deleteMany(predicate, { session });
      return { deletedTrips: result.deletedCount };
    });
  }
  return { policy, list, create, change, append, points, purgeExpired };
}
module.exports = { createTripsService, gpsPoint, transition, identifier, service: createTripsService() };
