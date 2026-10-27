const { withMongoTransaction, closeMongoConnection } = require('../infrastructure/soiMongo');
async function run({ apply = false } = {}) {
  // Planning never connects to MongoDB and never modifies existing records.
  if (!apply) return { mode: 'plan', backend: 'mongodb', predicate: 'expires_at <= current UTC instant', collections: ['soi_trips', 'soi_trip_points', 'soi_vehicle_positions'], historicalRecordsWithoutExpiry: 'untouched', automaticDeletion: 'TTL after explicit retention consent', deletedRecords: 0 };
  const timestamp = new Date();
  return withMongoTransaction(async (db, session) => {
    const predicate = { expires_at: { $lte: timestamp } };
    const trips = await db.collection('soi_trips').deleteMany(predicate, { session });
    const points = await db.collection('soi_trip_points').deleteMany(predicate, { session });
    const positions = await db.collection('soi_vehicle_positions').deleteMany(predicate, { session });
    return { mode: 'apply', backend: 'mongodb', deletedTrips: trips.deletedCount, deletedPoints: points.deletedCount, deletedVehiclePositions: positions.deletedCount };
  });
}
if (require.main === module) run({ apply: process.argv.includes('--apply') }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.code || error.statusCode || 'GPS retention failed'); process.exitCode = 1; }).finally(closeMongoConnection);
module.exports = { run };
