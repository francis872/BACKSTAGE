const asyncHandler = require('../utils/asyncHandler');
const integrationsService = require('../services/integrations.service');
const context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}});

const createSource = asyncHandler(async (req, res) => {
  const row = await integrationsService.service.register(context(req),req.body||{});
  res.status(201).json(row);
});

const createEvent = asyncHandler(async (req, res) => {
  const row = await integrationsService.service.record(context(req),req.body||{});
  res.status(201).json(row);
});

const getPendingEvents = asyncHandler(async (req, res) => {
  const rows = await integrationsService.service.pending(context(req),100);
  res.json(rows);
});

const completeEvent = asyncHandler(async (req, res) => {
  const result = await integrationsService.service.complete(context(req),req.params.id);
  res.json(result);
});

const listSources=asyncHandler(async(req,res)=>res.json({data:await integrationsService.service.list(context(req))}));
const getSource=asyncHandler(async(req,res)=>res.json({data:await integrationsService.service.get(context(req),req.params.id)}));
const updateSource=asyncHandler(async(req,res)=>res.json({data:await integrationsService.service.update(context(req),req.params.id,req.body||{})}));
const archiveSource=asyncHandler(async(req,res)=>{await integrationsService.service.update(context(req),req.params.id,req.body||{},{archive:true});res.status(204).end();});
module.exports = { createSource, createEvent, getPendingEvents, completeEvent,listSources,getSource,updateSource,archiveSource };
