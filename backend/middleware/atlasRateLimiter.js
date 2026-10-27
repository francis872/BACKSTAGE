const crypto = require('node:crypto');
// Native _id uniqueness in the existing technical-lock collection; no schema/ID migration.
async function consumeBucket(database, key, windowMs) {
  const collection = database.collection('soi_provider_locks');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await collection.findOneAndUpdate({ _id: key }, [{ $set: {
        count: { $cond: [{ $gt: ['$reset_at', '$$NOW'] }, { $add: ['$count', 1] }, 1] },
        reset_at: { $cond: [{ $gt: ['$reset_at', '$$NOW'] }, '$reset_at', { $add: ['$$NOW', windowMs] }] },
      } }], { upsert: true, returnDocument: 'after', includeResultMetadata: false });
    } catch (error) { if (error.code !== 11000 || attempt === 2) throw error; }
  }
}
function createAtlasRateLimiter({ namespace, windowMs, max, getDatabase = () => require('../infrastructure/platformMongo').getMongoDatabase(), consume = consumeBucket, subject: subjectFor } = {}) {
  if (!/^[a-z_-]{1,40}$/.test(namespace || '') || !Number.isSafeInteger(windowMs) || windowMs < 1000 || !Number.isSafeInteger(max) || max < 1) throw new Error('Invalid rate limit configuration');
  return async (req, res, next) => {
    // An authenticated subject for invitations; otherwise a normalized account.
    // This deliberately shares the account budget across IPs, proxies and instances.
    const subject = subjectFor ? subjectFor(req) : namespace === 'invitation_accept' ? String(req.user?.user_id || '') : typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!subject || subject.length > 254) return res.status(400).json({ error: 'Identidad de acceso inválida.', request_id: req.requestId });
    try {
      if (!process.env.JWT_SECRET) throw new Error('Missing signing secret');
      const key = `auth-rate:${namespace}:${crypto.createHmac('sha256', process.env.JWT_SECRET).update(subject).digest('hex')}`;
      const bucket = await consume(await getDatabase(), key, windowMs);
      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.reset_at.getTime() / 1000)));
      if (bucket.count > max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.reset_at.getTime() - Date.now()) / 1000))));
        return res.status(429).json({ error: 'Demasiados intentos. Intente nuevamente más tarde.', request_id: req.requestId });
      }
      return next();
    } catch { return res.status(503).json({ error: 'No se pudo comprobar el límite de acceso. Reintenta más tarde.', request_id: req.requestId }); }
  };
}
module.exports = { consumeBucket, createAtlasRateLimiter };
