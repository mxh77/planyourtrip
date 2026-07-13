const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/invitations — invitations PENDING pour l'email de l'utilisateur connecté
router.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const invitations = await prisma.roadtripMember.findMany({
    where: { email: user.email, status: 'PENDING' },
    include: {
      roadtrip: {
        select: { id: true, title: true, startDate: true, endDate: true, coverPhotoUrl: true },
      },
    },
    orderBy: { invitedAt: 'desc' },
  });

  res.json(invitations);
});

// PATCH /api/invitations/:id/accept — accepter une invitation
router.patch('/:id/accept', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const invitation = await prisma.roadtripMember.findFirst({
    where: { id: req.params.id, email: user.email, status: 'PENDING' },
  });

  if (!invitation) return res.status(404).json({ error: 'Invitation not found or already processed' });

  const updated = await prisma.roadtripMember.update({
    where: { id: req.params.id },
    data: { status: 'ACCEPTED', userId: req.user.userId, joinedAt: new Date() },
    include: {
      roadtrip: { select: { id: true, title: true } },
    },
  });

  res.json(updated);
});

// PATCH /api/invitations/:id/decline — refuser une invitation
router.patch('/:id/decline', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const invitation = await prisma.roadtripMember.findFirst({
    where: { id: req.params.id, email: user.email, status: 'PENDING' },
  });

  if (!invitation) return res.status(404).json({ error: 'Invitation not found or already processed' });

  const updated = await prisma.roadtripMember.update({
    where: { id: req.params.id },
    data: { status: 'DECLINED' },
  });

  res.json(updated);
});

module.exports = router;
