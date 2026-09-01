const asyncHandler = require('../utils/asyncHandler');
const integrationsService = require('../services/integrations.service');

const createSource = asyncHandler(async (req, res) => {
  const { name, type, config } = req.body || {};
  const row = await integrationsService.registerSource(name, type, config);
  res.status(201).json(row);
});

const createEvent = asyncHandler(async (req, res) => {
  const { source_id, external_id, payload } = req.body || {};
  const row = await integrationsService.recordEvent(source_id, external_id, payload);
  res.status(201).json(row);
});

const getPendingEvents = asyncHandler(async (req, res) => {
  const rows = await integrationsService.listPending(100);
  res.json(rows);
});

const completeEvent = asyncHandler(async (req, res) => {
  const result = await integrationsService.completeEvent(req.params.id);
  res.json(result);
});

module.exports = { createSource, createEvent, getPendingEvents, completeEvent };
