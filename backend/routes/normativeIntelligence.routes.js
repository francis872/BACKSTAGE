const express=require('express'),wrap=require('../utils/asyncHandler');
function createNormativeIntelligenceRouter(service=require('../services/normativeIntelligence.service').createNormativeIntelligenceService()){
 const router=express.Router({mergeParams:true}),context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}});
 const limiter=process.env.VERCEL?require('../middleware/atlasRateLimiter').createAtlasRateLimiter:require('../middleware/platformSecurity').createRateLimiter;
 router.use(limiter({namespace:'normative_intelligence',windowMs:15*60000,max:120,subject:req=>String(req.organization.organization_id)}));router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const save=async(res,work)=>{const r=await work;res.status(r.created?201:200).json(r);};
 router.get('/dictionary',wrap(async(req,res)=>res.json(await service.dictionary(context(req),req.params.id))));
 router.get('/records/:record',wrap(async(req,res)=>res.json(await service.get(context(req),req.params.id,req.params.record))));
 router.get('/records/:record/history',wrap(async(req,res)=>res.json(await service.history(context(req),req.params.id,req.params.record))));
 router.post('/reviewer-grants',wrap(async(req,res)=>res.json(await service.permissions(context(req),req.params.id,req.body))));
 router.post('/documents',wrap(async(req,res)=>save(res,service.saveDocument(context(req),req.params.id,req.body,req.get('Idempotency-Key')))));
 router.post('/documents/:record/review',wrap(async(req,res)=>save(res,service.reviewDocument(context(req),req.params.id,req.params.record,req.body,req.get('Idempotency-Key')))));
 router.post('/documents/:record/erase',wrap(async(req,res)=>res.json(await service.eraseDocument(context(req),req.params.id,req.params.record,req.body))));
 router.post('/interpretations',wrap(async(req,res)=>save(res,service.approveInterpretation(context(req),req.params.id,req.body,req.get('Idempotency-Key')))));
 router.post('/evaluations',wrap(async(req,res)=>save(res,service.evaluate(context(req),req.params.id,req.body,req.get('Idempotency-Key')))));
 router.post('/evaluations/:record/review',wrap(async(req,res)=>save(res,service.reviewEvaluation(context(req),req.params.id,req.params.record,req.body,req.get('Idempotency-Key')))));
 router.post('/evaluations/:record/reproduce',wrap(async(req,res)=>res.json(await service.reproduce(context(req),req.params.id,req.params.record))));
 return router;
}
module.exports={createNormativeIntelligenceRouter};
