const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const checkMemberRole = require('../middleware/checkMemberRole');

// All roadtrip routes require authentication
router.use(auth);

// GET /api/roadtrips — roadtrips owned + shared
router.get('/', async (req, res) => {
  const userId = req.user.userId;

  const ownedRoadtrips = await prisma.roadtrip.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        select: { id: true, name: true, location: true, startDate: true, order: true },
      },
    },
  });

  const memberships = await prisma.roadtripMember.findMany({
    where: { userId, status: 'ACCEPTED' },
    include: {
      roadtrip: {
        include: {
          steps: {
            orderBy: { order: 'asc' },
            select: { id: true, name: true, location: true, startDate: true, order: true },
          },
        },
      },
    },
  });

  const ownedWithRole = ownedRoadtrips.map(r => ({ ...r, userRole: 'OWNER' }));
  const sharedWithRole = memberships.map(m => ({ ...m.roadtrip, userRole: m.role }));

  // Dédupliquer : si l'utilisateur est à la fois owner ET membre (cas rare de migration),
  // on conserve uniquement la version owner pour éviter les doublons dans la liste.
  const allIds = new Set(ownedWithRole.map(r => r.id));
  const uniqueShared = sharedWithRole.filter(r => !allIds.has(r.id));

  const all = [...ownedWithRole, ...uniqueShared].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  res.json(all);
});

// POST /api/roadtrips
router.post('/', async (req, res) => {
  const { title, startDate, endDate, coverPhotoUrl, status } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const roadtrip = await prisma.roadtrip.create({
    data: {
      title,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      coverPhotoUrl: coverPhotoUrl || null,
      status: status || 'DRAFT',
      userId: req.user.userId,
    },
  });

  res.status(201).json(roadtrip);
});

// GET /api/roadtrips/:id — accessible par owner et membres ACCEPTED
router.get('/:id', async (req, res) => {
  const userId = req.user.userId;
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: req.params.id },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: true,
          activities: { orderBy: { startTime: "asc" } },
        },
      },
      members: { include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } } },
    },
  });

  if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });

  if (roadtrip.userId === userId) {
    return res.json({ ...roadtrip, userRole: 'OWNER' });
  }

  const member = roadtrip.members.find(m => m.userId === userId && m.status === 'ACCEPTED');
  if (!member) return res.status(403).json({ error: 'Access denied' });

  res.json({ ...roadtrip, userRole: member.role });
});

// PUT /api/roadtrips/:id — upsert (offline-first, ID généré côté client)
// Création : l'utilisateur devient owner. Mise à jour : owner uniquement.
router.put('/:id', async (req, res) => {
  const userId = req.user.userId;
  const { title, startDate, endDate, coverPhotoUrl, status, settings } = req.body;

  // Si le roadtrip existe déjà, vérifier que l'appelant est bien l'owner
  const existing = await prisma.roadtrip.findUnique({ where: { id: req.params.id } });
  if (existing && existing.userId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const roadtrip = await prisma.roadtrip.upsert({
    where: { id: req.params.id },
    create: {
      id: req.params.id,
      title: title || 'Nouveau roadtrip',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      coverPhotoUrl: coverPhotoUrl || null,
      status: status || 'DRAFT',
      settings: settings || undefined,
      userId,
    },
    update: {
      ...(title !== undefined && { title }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(coverPhotoUrl !== undefined && { coverPhotoUrl }),
      ...(status !== undefined && { status }),
      ...(settings !== undefined && { settings }),
    },
  });

  res.json(roadtrip);
});

// PATCH /api/roadtrips/:id — modification partielle (EDITOR+)
router.patch('/:id', checkMemberRole('EDITOR'), async (req, res) => {
  const { title, startDate, endDate, coverPhotoUrl, status, budgetTarget, fuelConsumption, fuelType, fuelPricePerL, settings } = req.body;

  const roadtrip = await prisma.roadtrip.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(coverPhotoUrl !== undefined && { coverPhotoUrl }),
      ...(status !== undefined && { status }),
      ...(budgetTarget !== undefined && { budgetTarget }),
      ...(fuelConsumption !== undefined && { fuelConsumption }),
      ...(fuelType !== undefined && { fuelType }),
      ...(fuelPricePerL !== undefined && { fuelPricePerL }),
      ...(settings !== undefined && { settings }),
    },
  });

  res.json(roadtrip);
});

// POST /api/roadtrips/:id/clone — cloner un roadtrip (owner ou membre)
router.post('/:id/clone', checkMemberRole('VIEWER'), async (req, res) => {
  const userId = req.user.userId;

  const original = await prisma.roadtrip.findUnique({
    where: { id: req.params.id },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: true,
          activities: { orderBy: { startTime: "asc" } },
        },
      },
    },
  });

  if (!original) return res.status(404).json({ error: 'Roadtrip not found' });

  const cloned = await prisma.roadtrip.create({
    data: {
      title: `Copie de ${original.title}`,
      startDate: original.startDate,
      endDate: original.endDate,
      coverPhotoUrl: original.coverPhotoUrl,
      status: 'DRAFT',
      settings: original.settings,
      userId,
      steps: {
        create: original.steps.map((step) => ({
          name: step.name,
          location: step.location,
          latitude: step.latitude,
          longitude: step.longitude,
          startDate: step.startDate,
          endDate: step.endDate,
          arrivalTime: step.arrivalTime,
          departureTime: step.departureTime,
          notes: step.notes,
          photoUrl: step.photoUrl,
          order: step.order,
          userId,
          accommodations: {
            create: step.accommodations.map((a) => ({
              type: a.type,
              name: a.name,
              address: a.address,
              latitude: a.latitude,
              longitude: a.longitude,
              checkIn: a.checkIn,
              checkOut: a.checkOut,
              bookingRef: a.bookingRef,
              bookingUrl: a.bookingUrl,
              pricePerNight: a.pricePerNight,
              currency: a.currency,
              notes: a.notes,
              status: a.status,
              userId,
            })),
          },
          activities: {
            create: step.activities.map((act) => ({
              type: act.type,
              name: act.name,
              location: act.location,
              latitude: act.latitude,
              longitude: act.longitude,
              startTime: act.startTime,
              endTime: act.endTime,
              bookingRef: act.bookingRef,
              bookingUrl: act.bookingUrl,
              cost: act.cost,
              currency: act.currency,
              notes: act.notes,
              status: act.status,
              order: act.order,
              userId,
            })),
          },
        })),
      },
    },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: true,
          activities: { orderBy: { startTime: "asc" } },
        },
      },
    },
  });

  res.status(201).json(cloned);
});

// DELETE /api/roadtrips/:id — suppression (OWNER uniquement)
router.delete('/:id', checkMemberRole('OWNER'), async (req, res) => {
  await prisma.roadtrip.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /api/roadtrips/:id/settings
router.get('/:id/settings', checkMemberRole('VIEWER'), async (req, res) => {
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: req.params.id },
    select: { settings: true },
  });
  if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });
  res.json(roadtrip.settings ?? {});
});

// PATCH /api/roadtrips/:id/settings — OWNER only
router.patch('/:id/settings', checkMemberRole('OWNER'), async (req, res) => {
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: req.params.id },
    select: { settings: true },
  });
  if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });

  const current = roadtrip.settings ?? {};
  const updated = { ...current, ...req.body };

  const result = await prisma.roadtrip.update({
    where: { id: req.params.id },
    data: { settings: updated },
    select: { settings: true },
  });
  res.json(result.settings);
});

module.exports = router;
