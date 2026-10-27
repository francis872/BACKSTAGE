const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
process.env.JWT_SECRET = 'identity-mfa-isolated-signing-key-not-production';
const T = require('./totp'), { setup } = require('./helpers/computationalFixture');
const { createIdentityMfaService } = require('../services/identityMfa.service');
const { createMongoIdentityService } = require('../services/mongoIdentity.service');
const { createHebraCipher } = require('../services/hebraCipher.service');
const { createPasswordHash, verifyToken } = require('../auth');
function fixture() {
  const s = setup(), user = s.f.data().identity_users.find(r => r.user_id === 1); Object.assign(user, { email: 'mfa@example.invalid', name: 'MFA fixture', password_hash: createPasswordHash('Owned-test-password-123') });
  const identity = createMongoIdentityService(s.infra), cipher = createHebraCipher({ HEBRA_ACTIVE_KEY_ID: 'owned', HEBRA_ENCRYPTION_KEYS: JSON.stringify({ owned: crypto.randomBytes(32).toString('base64') }) });
  const service = createIdentityMfaService({ infrastructure: s.infra, cipher, now: s.now, issueSession: identity.mfaSessionIn });
  return { ...s, identity, service, context: { user_id: 1, organization_id: 10, session_version: 0 }, password: 'Owned-test-password-123' };
}
function context(token) { const p = verifyToken(token); return { user_id: Number(p.sub), organization_id: p.organization_id, session_version: p.sv, session_id: p.jti }; }

test('native TOTP matches all SHA1 RFC6238 vectors and prevents replay of an accepted time step', () => {
  const secret = T.encode(Buffer.from('12345678901234567890'));
  for (const [time, expected] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) assert.equal(T.hotp(secret, Math.floor(time / 30), 8), expected);
  const now = 1234567890000, step = Math.floor(now / 30000), code = T.hotp(secret, step);
  assert.equal(T.matchedStep(secret, code, now), step); assert.equal(T.matchedStep(secret, code, now, step), null);
});

test('MFA enrollment requires password and proof, encrypts secrets, renews the native session and revokes older sessions', async () => {
  const s = fixture(); await assert.rejects(s.service.setup(s.context, {}), { statusCode: 403 });
  const enrolled = await s.service.setup(s.context, { current_password: s.password });
  assert(!JSON.stringify(s.f.data()).includes(enrolled.secret));
  await assert.rejects(s.service.confirm(s.context, { code: 'wrong' }), { statusCode: 403 });
  assert.equal(s.f.data().identity_users.find(r => r.user_id === 1).mfa_pending.attempts, 1);
  const result = await s.service.confirm(s.context, { code: T.hotp(enrolled.secret, Math.floor(s.now() / 30000)) });
  assert.equal(result.recovery_codes.length, 10); assert(result.token); assert(result.user.mfa_enabled);
  await assert.rejects(s.service.status(s.context), { statusCode: 401 }); assert((await s.service.status(context(result.token))).enabled);
  assert(!JSON.stringify(s.f.data()).includes(result.recovery_codes[0]));
});

test('password login cannot issue a session without MFA; challenges expire and OTP/recovery consumption is atomic', async () => {
  const s = fixture(), enrolled = await s.service.setup(s.context, { current_password: s.password });
  const enabled = await s.service.confirm(s.context, { code: T.hotp(enrolled.secret, Math.floor(s.now() / 30000)) });
  const pending = await s.identity.login({ email: 'mfa@example.invalid', password: s.password }); assert(pending.requires_mfa); assert.equal(pending.token, undefined);
  await assert.rejects(s.service.verifyLogin({ challenge: pending.challenge, code: T.hotp(enrolled.secret, Math.floor(s.now() / 30000)) }), { statusCode: 401 });
  s.advance(30000); const valid = T.hotp(enrolled.secret, Math.floor(s.now() / 30000));
  const completions = await Promise.allSettled([1, 2].map(() => s.service.verifyLogin({ challenge: pending.challenge, code: valid })));
  assert.equal(completions.filter(r => r.status === 'fulfilled').length, 1);
  const second = await s.identity.login({ email: 'mfa@example.invalid', password: s.password });
  const recovered = await s.service.verifyLogin({ challenge: second.challenge, code: enabled.recovery_codes[0] }); assert(recovered.token);
  const third = await s.identity.login({ email: 'mfa@example.invalid', password: s.password }); await assert.rejects(s.service.verifyLogin({ challenge: third.challenge, code: enabled.recovery_codes[0] }), { statusCode: 401 });
  s.advance(121000); await assert.rejects(s.service.verifyLogin({ challenge: third.challenge, code: enabled.recovery_codes[1] }), { statusCode: 401 });
});

test('repeated MFA failures stay persisted and block the challenge; disabling requires both password and an unused factor', async () => {
  const s = fixture(), enrolled = await s.service.setup(s.context, { current_password: s.password });
  const enabled = await s.service.confirm(s.context, { code: T.hotp(enrolled.secret, Math.floor(s.now() / 30000)) });
  const pending = await s.identity.login({ email: 'mfa@example.invalid', password: s.password });
  for (let i = 0; i < 5; i++) await assert.rejects(s.service.verifyLogin({ challenge: pending.challenge, code: 'invalid' }), { statusCode: 401 });
  assert.equal(s.f.data().identity_users.find(r => r.user_id === 1).mfa_login.attempts, 5);
  await assert.rejects(s.service.verifyLogin({ challenge: pending.challenge, code: enabled.recovery_codes[0] }), { statusCode: 401 });
  await assert.rejects(s.service.disable(context(enabled.token), { current_password: s.password, code: 'invalid' }), { statusCode: 403 });
  const disabled = await s.service.disable(context(enabled.token), { current_password: s.password, code: enabled.recovery_codes[0] }); assert.equal(disabled.enabled, false);
  assert((await s.identity.login({ email: 'mfa@example.invalid', password: s.password })).token);
});
