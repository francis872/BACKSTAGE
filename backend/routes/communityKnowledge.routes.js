const express=require('express'),wrap=require('../utils/asyncHandler');
function createCommunityKnowledgeRouter(service=require('../services/communityKnowledge.service').createCommunityKnowledgeService()){
 const router=express.Router({mergeParams:true}),context=req=>({organizationId:req.organization.organization_id,userId:req.user.user_id,session:{session_version:req.user.session_version??0,session_id:req.user.session_id||null}});
 router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 const limiter=process.env.VERCEL?require('../middleware/atlasRateLimiter').createAtlasRateLimiter:require('../middleware/platformSecurity').createRateLimiter;
 router.use(limiter({namespace:'community_knowledge',windowMs:15*60000,max:150,subject:req=>String(req.organization.organization_id)}));
 const save=async(res,work)=>{const r=await work;res.status(r.created?201:200).json(r);},ctx=req=>[context(req),req.params.id];
 router.get('/documents',wrap(async(req,res)=>res.json(await service.list(...ctx(req),req.query))));
 router.post('/documents',wrap(async(req,res)=>save(res,service.save(...ctx(req),req.body,req.get('Idempotency-Key')))));
 router.get('/documents/:record',wrap(async(req,res)=>res.json(await service.get(...ctx(req),req.params.record))));
 router.get('/documents/:record/history',wrap(async(req,res)=>res.json(await service.history(...ctx(req),req.params.record))));
 router.post('/documents/:record/analyze',wrap(async(req,res)=>save(res,service.analyze(...ctx(req),req.params.record,req.body,req.get('Idempotency-Key')))));
 router.post('/documents/:record/erase',wrap(async(req,res)=>res.json(await service.erase(...ctx(req),req.params.record,req.body))));
 router.get('/analyses/:record',wrap(async(req,res)=>res.json(await service.readAnalysis(...ctx(req),req.params.record))));
 router.get('/analyses/:record/history',wrap(async(req,res)=>res.json(await service.analysisHistory(...ctx(req),req.params.record))));
 router.post('/analyses/:record/reproduce',wrap(async(req,res)=>res.json(await service.reproduce(...ctx(req),req.params.record))));
 router.get('/shares',wrap(async(req,res)=>res.json(await service.shares(...ctx(req)))));
 router.post('/shares',wrap(async(req,res)=>save(res,service.offer(...ctx(req),req.body,req.get('Idempotency-Key')))));
 router.post('/shares/:record/respond',wrap(async(req,res)=>save(res,service.respond(...ctx(req),req.params.record,req.body,req.get('Idempotency-Key')))));
 router.get('/shares/:record/document',wrap(async(req,res)=>res.json(await service.shared(...ctx(req),req.params.record))));
 return router;
}
module.exports={createCommunityKnowledgeRouter};
