const validators = require('./soiValidation');
const { createMongoSoiService, CAPABILITIES } = require('./soiMongo.service');
module.exports = { ...validators, createSoiService: createMongoSoiService, CAPABILITIES };
