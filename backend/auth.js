const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'BACKSTAGE_DEFAULT_SECRET_CHANGE_ME';
const JWT_EXPIRES_IN = '8h';
const JWT_ISSUER = process.env.JWT_ISSUER || 'backstage-intelligence';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'backstage-platform';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

function createPasswordHash(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function isLegacyHash(storedHash) {
  return typeof storedHash === 'string' && storedHash.startsWith('pbkdf2_sha512$');
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith('$2')) {
    return bcrypt.compareSync(password, storedHash);
  }

  if (!isLegacyHash(storedHash)) {
    return false;
  }

  const [, iterations, salt, hash] = storedHash.split('$');
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    Number(iterations),
    Buffer.from(hash, 'hex').length,
    'sha512'
  ).toString('hex');

  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(derivedKey, 'hex');
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function createToken(user) {
  const payload = {
    sub: user.user_id,
    email: user.email,
    name: user.name || null,
    role: user.role,
    organization_id: user.organization_id || null,
    organization_slug: user.organization_slug || null,
    organization_name: user.organization_name || null,
    memberships: Array.isArray(user.memberships) ? user.memberships : [],
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyToken(token);
    req.user = {
      user_id: payload.sub,
      email: payload.email,
      name: payload.name || null,
      role: payload.role,
      organization_id: payload.organization_id || null,
      organization_slug: payload.organization_slug || null,
      organization_name: payload.organization_name || null,
      memberships: Array.isArray(payload.memberships) ? payload.memberships : [],
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

function authorizeRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (req.user.role !== requiredRole) {
      return res.status(403).json({ error: 'Permiso denegado.' });
    }
    next();
  };
}

module.exports = {
  createPasswordHash,
  verifyPassword,
  isLegacyHash,
  createToken,
  verifyToken,
  authenticate,
  authorizeRole,
};
