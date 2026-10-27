const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { createPasswordHash, verifyPassword, createToken } = require('../auth');
const { emailAddress, passwordValue } = require('../domain/identityCredentials');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const version = user => Number.isSafeInteger(user.session_version) ? user.session_version : 0;
const invalidSession = () => new ApiError(401, 'Esta sesión terminó. Inicia sesión de nuevo.');
function userId(context) {
  const id = Number(context.user_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw invalidSession();
  return id;
}
async function validateSessionIn(db, context, session, now = Date.now()) {
  const user = await db.collection('identity_users').findOne({ user_id: userId(context) }, { session });
  if (!user || user.status === 'disabled' || version(user) !== (context.session_version ?? 0)) throw invalidSession();
  if (context.session_id) {
    if (!/^[a-f0-9]{48}$/.test(context.session_id)) throw invalidSession();
    const active = user.auth_sessions?.[hash(context.session_id)];
    if (!active || new Date(active.expires_at).getTime() <= now) throw invalidSession();
  } else if (version(user) !== 0) throw invalidSession();
  return user;
}
async function issueSessionToken(infrastructure, db, session, profile, now = Date.now()) {
  const user = await db.collection('identity_users').findOne({ user_id: Number(profile.user_id) }, { session });
  if (!user || user.status === 'disabled') throw invalidSession();
  const entries = Object.entries(user.auth_sessions || {}).filter(([, value]) => new Date(value.expires_at).getTime() > now).sort((a,b) => new Date(b[1].started_at) - new Date(a[1].started_at)).slice(0, 19);
  const sid = crypto.randomBytes(24).toString('hex');
  const sessions = Object.fromEntries(entries);
  sessions[hash(sid)] = { started_at: new Date(now), expires_at: new Date(now + 8 * 60 * 60 * 1000), organization_id: profile.organization_id };
  await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { auth_sessions: sessions } }, { session });
  return createToken({ ...profile, session_id: sid, session_version: version(user) });
}
function createAccountSecurityService(infrastructure, { mailer = require('./authMail.service').createAuthMailer(), now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const infra = () => infrastructure || require('../infrastructure/platformMongo');
  const transaction = work => infra().withMongoTransaction(work);
  const response = { message: 'Si la cuenta puede recibir este enlace, llegará a su correo. Revisa también la carpeta de spam.' };
  async function audit(db, session, id, action) {
    await require('./mongoAudit.service').createMongoAuditService(infra()).appendAuditEvent({ organization_id: null, user_id: id, action, resource_type: 'identity_users', resource_id: String(id), request_method: 'DOMAIN', request_path: null, status_code: 200, metadata: { credential_material: 'omitted' } }, db, session);
  }
  const capabilities = () => ({ password_recovery_email: mailer.configured(), email_verification: mailer.configured(), password_change: true, session_management: true, legacy_sessions_preserved_until_revoked: true });
  const validateSession = async context => validateSessionIn(await infra().getMongoDatabase(), context, undefined, now());
  function inputFields(input, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new ApiError(400, 'Datos de seguridad inválidos.');
  }
  function actionToken(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ApiError(400, 'El enlace no es válido.');
    return hash(value);
  }
  async function requestAction(input, purpose, context) {
    inputFields(input, purpose === 'reset' ? ['email'] : []);
    const email = purpose === 'reset' ? emailAddress(input.email) : null;
    if (!mailer.configured()) throw new ApiError(503, 'El envío de correos todavía no está configurado. Contacta al administrador.');
    const started = now(), token = crypto.randomBytes(32).toString('base64url'), tokenHash = hash(token), actionId = crypto.randomUUID();
    const recipient = await transaction(async (db, session) => {
      const user = context ? await validateSessionIn(db, context, session, now()) : await db.collection('identity_users').findOne({ email }, { session });
      if (!user || user.status === 'disabled' || purpose === 'verify' && user.email_verified_at) return null;
      if (user.auth_actions?.[purpose]?.requested_at && now() - new Date(user.auth_actions[purpose].requested_at).getTime() < 60000) return null;
      const actions = { ...(user.auth_actions || {}), [purpose]: { token_hash: tokenHash, requested_at: new Date(now()), expires_at: new Date(now() + 30 * 60 * 1000), session_version: version(user), delivery_state: 'pending' } };
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { auth_actions: actions } }, { session });
      await audit(db, session, user.user_id, purpose === 'reset' ? 'account.recovery_requested' : 'account.verification_requested');
      return { email: user.email, id: user.user_id };
    });
    // Mail transport runs after the HTTP response (waitUntil on Vercel), so its
    // latency or failure cannot disclose whether the email belongs to an account.
    await sleep(Math.max(0, 200 - (now() - started)));
    const dispatch = recipient ? async () => {
      try {
        await mailer.send({ to: recipient.email, purpose, token, actionId });
        const db = await infra().getMongoDatabase();
        await db.collection('identity_users').updateOne({ user_id: recipient.id, [`auth_actions.${purpose}.token_hash`]: tokenHash }, { $set: { [`auth_actions.${purpose}.delivery_state`]: 'accepted' } });
      } catch {
        const db = await infra().getMongoDatabase();
        await db.collection('identity_users').updateOne({ user_id: recipient.id, [`auth_actions.${purpose}.token_hash`]: tokenHash }, { $set: { [`auth_actions.${purpose}`]: null } });
      }
    } : null;
    return { response, dispatch };
  }
  async function consume(input, purpose) {
    inputFields(input, purpose === 'reset' ? ['token', 'password'] : ['token']);
    const tokenHash = actionToken(input.token);
    const password = purpose === 'reset' ? passwordValue(input.password) : null;
    return transaction(async (db, session) => {
      const user = await db.collection('identity_users').findOne({ [`auth_actions.${purpose}.token_hash`]: tokenHash }, { session });
      const action = user?.auth_actions?.[purpose];
      if (!user || user.status === 'disabled' || !action || new Date(action.expires_at).getTime() <= now() || action.session_version !== version(user)) throw new ApiError(410, 'El enlace venció, ya se usó o fue reemplazado. Solicita uno nuevo.');
      const fields = { [`auth_actions.${purpose}`]: null, email_verified_at: new Date(now()), updated_at: new Date(now()) };
      if (purpose === 'reset') Object.assign(fields, { password_hash: createPasswordHash(password), session_version: version(user) + 1, auth_sessions: {}, auth_actions: {} });
      // Setting a parent and its child together is invalid in MongoDB.
      if (purpose === 'reset') delete fields[`auth_actions.${purpose}`];
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: fields }, { session });
      await audit(db, session, user.user_id, purpose === 'reset' ? 'account.password_reset' : 'account.email_verified');
      return { message: purpose === 'reset' ? 'Tu contraseña cambió. Inicia sesión con la nueva contraseña.' : 'Tu correo quedó verificado.', requires_login: purpose === 'reset' };
    });
  }
  async function changePassword(context, input) {
    inputFields(input, ['current_password', 'password']);
    const password = passwordValue(input.password);
    await transaction(async (db, session) => {
      const user = await validateSessionIn(db, context, session, now());
      if (typeof input.current_password !== 'string' || Buffer.byteLength(input.current_password) > 72 || !verifyPassword(input.current_password, user.password_hash)) throw new ApiError(403, 'La contraseña actual no coincide.');
      await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { password_hash: createPasswordHash(password), session_version: version(user) + 1, auth_sessions: {}, auth_actions: {}, updated_at: new Date(now()) } }, { session });
      await audit(db, session, user.user_id, 'account.password_changed');
    });
    return { requires_login: true, message: 'Tu contraseña cambió y las sesiones anteriores se cerraron.' };
  }
  async function sessions(context) {
    const user = await validateSession(context), current = context.session_id ? hash(context.session_id) : null;
    return { data: Object.entries(user.auth_sessions || {}).filter(([, s]) => new Date(s.expires_at).getTime() > now()).map(([id, s]) => ({ id, started_at: s.started_at, expires_at: s.expires_at, organization_id: s.organization_id, current: id === current })), legacy_current: !context.session_id, legacy_sessions_may_exist: version(user) === 0 };
  }
  async function revoke(context, { all = false, id = null, current_password } = {}) {
    const result = await transaction(async (db, session) => {
      const user = await validateSessionIn(db, context, session, now());
      const current = context.session_id ? hash(context.session_id) : null;
      if (all && (typeof current_password !== 'string' || Buffer.byteLength(current_password) > 72 || !verifyPassword(current_password, user.password_hash))) throw new ApiError(403, 'Confirma tu contraseña actual para cerrar todas las sesiones.');
      const target = id || current;
      if (id && !/^[a-f0-9]{64}$/.test(id)) throw new ApiError(400, 'Sesión inválida.');
      if (id && !user.auth_sessions?.[id]) throw new ApiError(404, 'La sesión no está disponible.');
      if (all || !current && !id) {
        await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { session_version: version(user) + 1, auth_sessions: {}, auth_actions: {} } }, { session });
      } else {
        const next = { ...(user.auth_sessions || {}) }; delete next[target];
        await db.collection('identity_users').updateOne({ user_id: user.user_id }, { $set: { auth_sessions: next } }, { session });
      }
      await audit(db, session, user.user_id, all ? 'account.sessions_revoked' : 'account.session_revoked');
      return { current_session_closed: all || !current && !id || target === current };
    });
    return result;
  }
  return { capabilities, validateSession, requestReset: input => requestAction(input, 'reset'), requestVerification: context => requestAction({}, 'verify', context), resetPassword: input => consume(input, 'reset'), verifyEmail: input => consume(input, 'verify'), changePassword, sessions, revoke };
}
module.exports = { validateSessionIn, issueSessionToken, createAccountSecurityService, service: createAccountSecurityService() };
