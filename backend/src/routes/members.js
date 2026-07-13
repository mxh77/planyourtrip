const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const checkMemberRole = require('../middleware/checkMemberRole');

router.use(auth);

// GET /api/roadtrips/:roadtripId/members/my-role — rôle de l'utilisateur connecté sur ce roadtrip
// IMPORTANT : Cette route doit être déclarée AVANT /:roadtripId/members pour éviter qu'Express
// interprète "my-role" comme un :memberId dans les routes PATCH/DELETE /:roadtripId/members/:memberId.
router.get('/:roadtripId/members/my-role', async (req, res) => {
  const roadtrip = await prisma.roadtrip.findUnique({ where: { id: req.params.roadtripId } });
  if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });

  if (roadtrip.userId === req.user.userId) {
    return res.json({ role: 'OWNER' });
  }

  const member = await prisma.roadtripMember.findFirst({
    where: { roadtripId: req.params.roadtripId, userId: req.user.userId, status: 'ACCEPTED' },
  });

  if (!member) return res.status(403).json({ error: 'Access denied' });
  res.json({ role: member.role });
});

// GET /api/roadtrips/:roadtripId/members — liste des membres
router.get('/:roadtripId/members', checkMemberRole('VIEWER'), async (req, res) => {
  const members = await prisma.roadtripMember.findMany({
    where: { roadtripId: req.params.roadtripId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { invitedAt: 'asc' },
  });

  // Récupérer aussi l'owner natif (userId du roadtrip)
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: req.params.roadtripId },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  const ownerEntry = {
    id: `owner-${roadtrip.userId}`,
    role: 'OWNER',
    status: 'ACCEPTED',
    email: roadtrip.user.email,
    userId: roadtrip.userId,
    user: roadtrip.user,
    roadtripId: roadtrip.id,
    invitedAt: roadtrip.createdAt,
    joinedAt: roadtrip.createdAt,
  };

  res.json([ownerEntry, ...members]);
});

// POST /api/roadtrips/:roadtripId/members — inviter un membre (OWNER uniquement)
router.post('/:roadtripId/members', checkMemberRole('OWNER'), async (req, res) => {
  const { role } = req.body;
  const email = req.body.email?.trim().toLowerCase();

  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!['EDITOR', 'VIEWER'].includes(role)) {
    return res.status(400).json({ error: 'role must be EDITOR or VIEWER' });
  }

  try {
    // Empêcher d'inviter l'owner lui-même
    const roadtrip = await prisma.roadtrip.findUnique({ where: { id: req.params.roadtripId } });
    const ownerUser = await prisma.user.findUnique({ where: { id: roadtrip.userId } });
    if (ownerUser?.email === email) {
      return res.status(400).json({ error: 'Cannot invite the owner' });
    }

    // Vérifier si l'utilisateur existe déjà
    const invitedUser = await prisma.user.findUnique({ where: { email } });

    // Upsert : si invitation existante, on met à jour le rôle
    const member = await prisma.roadtripMember.upsert({
      where: { roadtripId_email: { roadtripId: req.params.roadtripId, email } },
      create: {
        roadtripId: req.params.roadtripId,
        email,
        role,
        status: invitedUser ? 'ACCEPTED' : 'PENDING',
        userId: invitedUser?.id ?? null,
        joinedAt: invitedUser ? new Date() : null,
      },
      update: { role, status: invitedUser ? 'ACCEPTED' : 'PENDING' },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    res.status(201).json(member);
  } catch (err) {
    console.error('[members] POST error:', err.message);
    res.status(500).json({ error: 'Impossible d\'inviter ce membre.' });
  }
});

// PATCH /api/roadtrips/:roadtripId/members/:memberId — changer le rôle (OWNER uniquement)
router.patch('/:roadtripId/members/:memberId', checkMemberRole('OWNER'), async (req, res) => {
  const { role } = req.body;
  if (!['EDITOR', 'VIEWER'].includes(role)) {
    return res.status(400).json({ error: 'role must be EDITOR or VIEWER' });
  }

  try {
    const member = await prisma.roadtripMember.findFirst({
      where: { id: req.params.memberId, roadtripId: req.params.roadtripId },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const updated = await prisma.roadtripMember.update({
      where: { id: req.params.memberId },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });

    res.json(updated);
  } catch (err) {
    console.error('[members] PATCH error:', err.message);
    res.status(500).json({ error: 'Impossible de modifier le rôle.' });
  }
});

// DELETE /api/roadtrips/:roadtripId/members/:memberId — retirer un membre (OWNER uniquement)
router.delete('/:roadtripId/members/:memberId', checkMemberRole('OWNER'), async (req, res) => {
  try {
    const member = await prisma.roadtripMember.findFirst({
      where: { id: req.params.memberId, roadtripId: req.params.roadtripId },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await prisma.roadtripMember.delete({ where: { id: req.params.memberId } });
    res.status(204).send();
  } catch (err) {
    console.error('[members] DELETE error:', err.message);
    res.status(500).json({ error: 'Impossible de retirer ce membre.' });
  }
});

module.exports = router;
