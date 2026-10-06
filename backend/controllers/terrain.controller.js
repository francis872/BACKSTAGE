const asyncHandler = require('../utils/asyncHandler');
const terrainService = require('../services/terrain.service');

const getSurface = asyncHandler(async (req, res) => res.json(terrainService.getSurface(req.query)));
const analyze = asyncHandler(async (req, res) => res.json(terrainService.analyze(req.body)));

module.exports = { getSurface, analyze };
