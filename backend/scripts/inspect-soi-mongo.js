// Read only. Prints connection capabilities and collection names, never documents or URI.
const { getMongoDatabase, closeMongoConnection } = require('../infrastructure/soiMongo');
async function inspect() {
  if (!process.env.MONGODB_URI) return console.log(JSON.stringify({ configured: false, status: 'not_configured' }));
  const db = await getMongoDatabase({ requireSchema: false });
  const hello = await db.command({ hello: 1 });
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  console.log(JSON.stringify({ configured: true, status: 'readable', replicaSet: Boolean(hello.setName || hello.msg === 'isdbgrid'), collections }));
}
inspect().catch((error) => { console.error(JSON.stringify({ status:'not_verified', code:error.code || error.statusCode || 'MONGO_UNAVAILABLE',diagnostic:error.diagnostic||null })); process.exitCode=1; }).finally(closeMongoConnection);
