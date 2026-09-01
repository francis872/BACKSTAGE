const ROLES = Object.freeze({
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
});

/**
 * Middleware factory: allows access only to authenticated users whose role
 * is included in `roles`. Must run after `authenticate`.
 */
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Permiso denegado. Rol requerido: ${roles.join(' o ')}.` });
    }
    next();
  };
}

module.exports = { ROLES, authorizeRoles };
