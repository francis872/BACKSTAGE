const crypto = require('node:crypto');
const C = require('../utils/inputValidation');
const T = require('../domain/totp');
const { verifyPassword } = require('../auth');
const { validateSessionIn } = require('./accountSecurity.service');
const { createHebraCipher } = require('./hebraCipher.service');
const { appendPlatformAudit } = require('./platformAudit.service');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function createIdentityMfaService({ infrastructure = require('../infrastructure/platformMongo'), cipher = createHebraCipher(), now = Date.now, issueSession } = {}) {
  const binding = (id, enrollment) => ({ user_id: id, enrollment_id: enrollment, purpose: 'backstage.identity.totp' });
  const issue = (...args) => { if (typeof issueSession !== 'function') C.fail('La emisión de sesiones no está disponible.', 503); return issueSession(...args); };
  const audit = (db, session, userId, org, action) => appendPlatformAudit(infrastructure, db, session, { organizationId: org, userId }, `identity.mfa.${action}`, 'identity_users', userId, { secret_material: 'omitted' });
  async function self(db, session, context, password) {
    const user = await validateSessionIn(db, context, session, now());
    if (password !== undefined && (typeof password !== 'string' || Buffer.byteLength(password) > 72 || !verifyPassword(password, user.password_hash))) C.fail('Confirma tu contraseña actual.', 403);
    const member = await db.collection('identity_memberships').findOne({ organization_id: C.identifier(context.organization_id), user_id: user.user_id }, { session });
    const org = await db.collection('identity_organizations').findOne({ organization_id: C.identifier(context.organization_id), status: 'active' }, { session });
    if (!member || !org) C.fail('La organización no está disponible.', 403); return user;
  }
  async function status(context) {
    const db = await infrastructure.getMongoDatabase(), user = await self(db, undefined, context);
    return { enabled: user.mfa?.enabled === true, available: cipher.configured(), provider: 'backstage_identity', method: 'totp_rfc6238', recovery_codes_remaining: user.mfa?.recovery_hashes?.length || 0 };
  }
  async function setup(context, input) {
    C.object(input, ['current_password']);
    if (typeof input.current_password !== 'string') C.fail('Confirma tu contraseña actual.', 403);
    return infrastructure.withMongoTransaction(async (db, session) => {
      const user = await self(db, session, context, input.current_password); if (user.mfa?.enabled) C.fail('Desactiva el segundo factor existente antes de reemplazarlo.', 409);
      const secret = T.encode(crypto.randomBytes(20)), enrollment = crypto.randomUUID(), sealed = cipher.seal({ secret }, binding(user.user_id, enrollment));
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { mfa_pending: { enrollment_id: enrollment, envelope: sealed.envelope, commitment: sealed.commitment, expires_at: new Date(now() + 300000), attempts: 0 } } }, { session });
      await audit(db, session, user.user_id, context.organization_id, 'enrollment_started');
      return { secret, otpauth_uri: `otpauth://totp/${encodeURIComponent('BACKSTAGE:' + user.email)}?secret=${secret}&issuer=BACKSTAGE&algorithm=SHA1&digits=6&period=30`, expires_in_seconds: 300 };
    });
  }
  async function confirm(context, input) {
    C.object(input, ['code']);
    const result = await infrastructure.withMongoTransaction(async (db, session) => {
      const user = await self(db, session, context), p = user.mfa_pending;
      if (user.mfa?.enabled || !p || new Date(p.expires_at).getTime() <= now() || p.attempts >= 5) C.fail('La configuración venció. Comienza de nuevo.', 409);
      const { secret } = cipher.open(p.envelope, p.commitment, binding(user.user_id, p.enrollment_id)), step = T.matchedStep(secret, input.code, now());
      if (step == null) { await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $inc: { 'mfa_pending.attempts': 1 } }, { session }); await audit(db, session, user.user_id, context.organization_id, 'enrollment_failed'); return { rejected: true }; }
      const codes = Array.from({ length: 10 }, () => `bsc-${crypto.randomBytes(10).toString('hex')}`);
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { mfa: { enabled: true, enrollment_id: p.enrollment_id, envelope: p.envelope, commitment: p.commitment, last_step: step, recovery_hashes: codes.map(sha), enabled_at: new Date(now()) }, session_version: (user.session_version || 0) + 1, auth_sessions: {} }, $unset: { mfa_pending: '', mfa_login: '' } }, { session });
      await audit(db, session, user.user_id, context.organization_id, 'enabled');
      return { ...await issue(db, session, user.user_id, context.organization_id), recovery_codes: codes, enabled: true, other_sessions_revoked: true };
    });
    if (result.rejected) C.fail('El código no es válido.', 403); return result;
  }
  async function challengeIn(db, session, user, organizationId) {
    if (!user.mfa?.enabled) return null;
    const challenge = crypto.randomBytes(32).toString('base64url');
    await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { mfa_login: { challenge_hash: sha(challenge), organization_id: organizationId, session_version: user.session_version || 0, expires_at: new Date(now() + 120000), attempts: 0 } } }, { session });
    await audit(db, session, user.user_id, organizationId, 'challenge_issued');
    return { requires_mfa: true, challenge, expires_in_seconds: 120, methods: ['totp', 'recovery_code'] };
  }
  function validateFactor(user, code) {
    const m = user.mfa;
    if (typeof code === 'string' && /^bsc-[a-f0-9]{20}$/.test(code)) { const h = sha(code); if (m.recovery_hashes.includes(h)) return { recovery_hashes: m.recovery_hashes.filter(value => value !== h), used_recovery: true }; return null; }
    const { secret } = cipher.open(m.envelope, m.commitment, binding(user.user_id, m.enrollment_id)), step = T.matchedStep(secret, code, now(), m.last_step);
    return step == null ? null : { last_step: step, used_recovery: false };
  }
  async function verifyLogin(input) {
    C.object(input, ['challenge', 'code']); if (typeof input.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.challenge)) C.fail('El desafío de acceso no es válido.', 401);
    const result = await infrastructure.withMongoTransaction(async (db, session) => {
      const user = await db.collection('identity_users').findOne({ 'mfa_login.challenge_hash': sha(input.challenge) }, { session }), login = user?.mfa_login;
      if (!user || user.status === 'disabled' || !user.mfa?.enabled || !login || login.attempts >= 5 || new Date(login.expires_at).getTime() <= now() || login.session_version !== (user.session_version || 0)) C.fail('El desafío venció. Inicia sesión de nuevo.', 401);
      const factor = validateFactor(user, input.code);
      if (!factor) {
        await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $inc: { 'mfa_login.attempts': 1 } }, { session });
        await audit(db, session, user.user_id, login.organization_id, 'challenge_failed');
        if (login.attempts === 4) {
          const dedupe = `identity-mfa-lock:${user.user_id}`;
          if (!await db.collection('operational_events').findOne({ organization_id: login.organization_id, dedupe_key: dedupe, resolved_at: null }, { session })) {
            await db.collection('operational_events').insertOne({ operational_event_id: await infrastructure.nextId('operational_events', session), organization_id: login.organization_id, event_type: 'security.mfa_challenge_locked', severity: 'warning', title: 'Acceso bloqueado tras varios códigos incorrectos', actor_user_id: user.user_id, payload: { user_id: user.user_id, failed_attempts: 5 }, dedupe_key: dedupe, resolved_at: null, created_at: new Date(now()) }, { session });
          }
        }
        return { rejected: true };
      }
      const mfa = { ...user.mfa, ...(factor.used_recovery ? { recovery_hashes: factor.recovery_hashes } : { last_step: factor.last_step }) };
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { mfa }, $unset: { mfa_login: '' } }, { session });
      await audit(db, session, user.user_id, login.organization_id, factor.used_recovery ? 'recovery_code_used' : 'challenge_succeeded');
      return issue(db, session, user.user_id, login.organization_id);
    });
    if (result.rejected) C.fail('El código no es válido.', 401); return result;
  }
  async function disable(context, input) {
    C.object(input, ['current_password', 'code']);
    if (typeof input.current_password !== 'string') C.fail('Confirma tu contraseña actual.', 403);
    const result = await infrastructure.withMongoTransaction(async (db, session) => {
      const user = await self(db, session, context, input.current_password); if (!user.mfa?.enabled) C.fail('El segundo factor ya está desactivado.', 409);
      if (!validateFactor(user, input.code)) { await audit(db, session, user.user_id, context.organization_id, 'disable_rejected'); return { rejected: true }; }
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $unset: { mfa: '', mfa_login: '', mfa_pending: '' }, $set: { session_version: (user.session_version || 0) + 1, auth_sessions: {} } }, { session });
      await audit(db, session, user.user_id, context.organization_id, 'disabled');
      return { ...await issue(db, session, user.user_id, context.organization_id), enabled: false, other_sessions_revoked: true };
    });
    if (result.rejected) C.fail('El código no es válido.', 403); return result;
  }
  return { status, setup, confirm, challengeIn, verifyLogin, disable };
}
module.exports = { createIdentityMfaService };
