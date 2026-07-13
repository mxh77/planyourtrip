const prisma = require('../lib/prisma');

/**
 * Middleware factory — vérifie que l'utilisateur connecté a au moins le rôle requis sur le roadtrip.
 * Le roadtripId est attendu dans req.params.roadtripId, req.params.id, req.body.roadtripId ou req.query.roadtripId.
 * Injecte req.userRole et req.isOwner pour usage dans les routes.
 *
 * @param {'OWNER'|'EDITOR'|'VIEWER'} minRole
 */
function checkMemberRole(minRole = 'VIEWER') {
  const ROLE_RANK = { VIEWER: 0, EDITOR: 1, OWNER: 2 };
  return async (req, res, next) => {
    const roadtripId =
      req.params.roadtripId ||
      req.params.id ||
      req.body?.roadtripId ||
      req.query?.roadtripId;

    if (!roadtripId) return res.status(400).json({ error: 'roadtripId is required' });

    // L'owner "natif" (userId sur roadtrip) a toujours le rôle OWNER
    const roadtrip = await prisma.roadtrip.findUnique({ where: { id: roadtripId } });
    if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });

    if (roadtrip.userId === req.user.userId) {
      req.userRole = 'OWNER';
      req.isOwner = true;
      return next();
    }

    // Chercher dans les membres
    const member = await prisma.roadtripMember.findFirst({
      where: {
        roadtripId,
        userId: req.user.userId,
        status: 'ACCEPTED',
      },
    });

    if (!member) return res.status(403).json({ error: 'Access denied' });

    if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: `Role ${minRole} required` });
    }

    req.userRole = member.role;
    req.isOwner = false;
    next();
  };
}

module.exports = checkMemberRole;
