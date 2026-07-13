const prisma = require('./prisma');

/**
 * Retourne le rôle de l'utilisateur sur un roadtrip (via l'ownership ou un membership ACCEPTED).
 * Retourne 'OWNER', 'EDITOR', 'VIEWER' ou null si l'accès est refusé.
 *
 * @param {string} roadtripId
 * @param {string} userId
 * @returns {Promise<'OWNER'|'EDITOR'|'VIEWER'|null>}
 */
async function getUserRoleOnRoadtrip(roadtripId, userId) {
  const roadtrip = await prisma.roadtrip.findUnique({ where: { id: roadtripId } });
  if (!roadtrip) return null;
  if (roadtrip.userId === userId) return 'OWNER';

  const member = await prisma.roadtripMember.findFirst({
    where: { roadtripId, userId, status: 'ACCEPTED' },
  });
  return member?.role ?? null;
}

/**
 * Retourne le rôle de l'utilisateur sur le roadtrip auquel appartient une étape.
 *
 * @param {string} stepId
 * @param {string} userId
 * @returns {Promise<'OWNER'|'EDITOR'|'VIEWER'|null>}
 */
async function getUserRoleViaStep(stepId, userId) {
  const step = await prisma.step.findFirst({
    where: { id: stepId },
    select: { roadtripId: true },
  });
  if (!step) return null;
  return getUserRoleOnRoadtrip(step.roadtripId, userId);
}

module.exports = { getUserRoleOnRoadtrip, getUserRoleViaStep };
