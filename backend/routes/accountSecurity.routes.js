const express = require('express');
const { authenticate } = require('../auth');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const security = require('../services/accountSecurity.service');
const requireActiveSession = asyncHandler(async (req,res,next) => { await require('../services/mongoIdentity.service').service.validateSession(req.user); next(); });
function createAccountSecurityRouter(service = security.service, { limiterFactory } = {}) {
  const router = express.Router();
  const limiter = limiterFactory || (process.env.VERCEL ? require('../middleware/atlasRateLimiter').createAtlasRateLimiter : require('../middleware/platformSecurity').createRateLimiter);
  const limit = (namespace, max, subject) => limiter({ namespace, max, windowMs: 15 * 60 * 1000, subject });
  const ip = req => String(req.ip || req.socket?.remoteAddress || 'unknown');
  const identity = req => String(req.user?.user_id || 'unknown');
  const active = asyncHandler(async (req,res,next) => { await service.validateSession(req.user); next(); });
  const dispatch = async (operation, res) => {
    const job = await operation;
    res.status(202).json(job.response);
    if (job.dispatch) {
      const task = job.dispatch().catch(() => { console.warn(JSON.stringify({code:'auth_email_delivery_failed'})); });
      if (process.env.VERCEL) require('@vercel/functions').waitUntil(task);
    }
  };
  router.get('/capabilities', (req,res) => { res.set('Cache-Control','no-store'); res.json(service.capabilities()); });
  router.post('/forgot-password', limit('recovery_ip',30,ip), limit('recovery_email',5), asyncHandler(async(req,res) => dispatch(service.requestReset(req.body),res)));
  router.post('/reset-password', limit('recovery_complete',30,ip), asyncHandler(async(req,res) => res.json(await service.resetPassword(req.body))));
  router.post('/verify-email', limit('verification_complete',30,ip), asyncHandler(async(req,res) => res.json(await service.verifyEmail(req.body))));
  router.post('/request-verification', authenticate, active, limit('verification_request',5,identity), asyncHandler(async(req,res) => dispatch(service.requestVerification(req.user),res)));
  router.post('/change-password', authenticate, active, limit('password_change',10,identity), asyncHandler(async(req,res) => res.json(await service.changePassword(req.user,req.body))));
  router.get('/sessions', authenticate, active, asyncHandler(async(req,res) => { res.set('Cache-Control','no-store');res.json(await service.sessions(req.user)); }));
  router.post('/sessions/revoke-all', authenticate, active, limit('sessions_revoke',10,identity), asyncHandler(async(req,res) => res.json(await service.revoke(req.user,{all:true,current_password:req.body?.current_password}))));
  router.delete('/sessions/:id', authenticate, active, asyncHandler(async(req,res) => res.json(await service.revoke(req.user,{id:req.params.id}))));
  router.post('/logout', authenticate, active, asyncHandler(async(req,res) => res.json(await service.revoke(req.user))));
  router.use((error,req,res,next) => {
    if(res.headersSent)return next(error);
    if(error instanceof ApiError)return res.status(error.statusCode).json({error:error.message,code:error.statusCode===401?'SESSION_REVOKED':error.statusCode===503?'AUTH_EMAIL_UNAVAILABLE':undefined});
    res.status(503).json({error:'No se pudo completar la operación de seguridad. Reintenta más tarde.'});
  });
  return router;
}
module.exports = { createAccountSecurityRouter, requireActiveSession };
