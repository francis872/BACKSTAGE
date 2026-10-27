const { initializeMongo, closeMongoConnection } = require('../infrastructure/soiMongo');
initializeMongo({ apply: process.argv.includes('--apply') }).then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(JSON.stringify({ status: 'failed', code: error.code || error.statusCode || 'MONGO_INITIALIZATION_FAILED', message: 'No se completó la inicialización; no se eliminaron registros ni se ocultaron conflictos de índices.' })); process.exitCode = 1; })
  .finally(closeMongoConnection);
