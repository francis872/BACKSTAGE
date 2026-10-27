const express=require('express'),wrap=require('../utils/asyncHandler');
function createEconomicIntelligenceRouter(service=require('../services/economicIntelligence.service').createEconomicIntelligenceService()){
 const router=express.Router({mergeParams:true});
 const context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}});
 const limiter=process.env.VERCEL?require('../middleware/atlasRateLimiter').createAtlasRateLimiter:require('../middleware/platformSecurity').createRateLimiter;
 const budget=limiter({namespace:'economic_intelligence',windowMs:15*60000,max:40,subject:req=>String(req.organization.organization_id)});
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 router.post('/preview',wrap(async(req,res)=>res.json(await service.preview(context(req),req.params.id,req.body))));
 router.get('/scenarios',wrap(async(req,res)=>res.json(await service.list(context(req),req.params.id))));
 router.post('/scenarios',budget,wrap(async(req,res)=>{const r=await service.create(context(req),req.params.id,req.body,req.get('Idempotency-Key'));res.status(r.created?201:200).json(r);}));
 router.get('/scenarios/:scenario',wrap(async(req,res)=>res.json(await service.get(context(req),req.params.id,req.params.scenario))));
 router.post('/scenarios/:scenario/revise',budget,wrap(async(req,res)=>{const{revision,assumptions}=req.body||{};const r=await service.create(context(req),req.params.id,assumptions,req.get('Idempotency-Key'),{priorId:req.params.scenario,revision});res.status(r.created?201:200).json(r);}));
 router.post('/scenarios/:scenario/approve',budget,wrap(async(req,res)=>res.json(await service.approve(context(req),req.params.id,req.params.scenario,req.body,req.get('Idempotency-Key')))));
 router.post('/scenarios/:scenario/reproduce',budget,wrap(async(req,res)=>res.json(await service.reproduce(context(req),req.params.id,req.params.scenario))));
 return router;
}
module.exports={createEconomicIntelligenceRouter};
