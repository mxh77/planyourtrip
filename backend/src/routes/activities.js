const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getUserRoleViaStep } = require('../lib/roleHelpers');
const { notifyRoadtripMembers } = require('../lib/notify');

// Crée une Date dont l'heure UTC correspond à l'heure saisie (préserve "05:00" quels que soient le fuseau et la saison)
function toUTCDate(str) {
  if (!str) return null;
  const [ymd, hhmm] = str.split(' ');
  const [y, m, d] = ymd.split('-').map(Number);
  if (hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

router.use(auth);

// GET /api/activities?stepId=
router.get('/', async (req, res) => {
  const { stepId } = req.query;

  if (!stepId) {
    return res.status(400).json({ error: 'stepId query param is required' });
  }

  const role = await getUserRoleViaStep(stepId, req.user.userId);
  if (!role) {
    return res.status(404).json({ error: 'Step not found' });
  }

  const activities = await prisma.activity.findMany({
    where: { stepId },
    orderBy: { startTime: 'asc' },
  });

  res.json(activities);
});

// POST /api/activities — écriture : EDITOR+
router.post('/', async (req, res) => {
  const { stepId, type, name, location, latitude, longitude, startTime, endTime, bookingRef, bookingUrl, cost, currency, notes, status, order } = req.body;

  if (!stepId || !name) {
    return res.status(400).json({ error: 'stepId and name are required' });
  }

  const role = await getUserRoleViaStep(stepId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Step not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.findUnique({ where: { id: stepId }, select: { roadtripId: true } });

  const activity = await prisma.activity.create({
    data: {
      stepId,
      userId: req.user.userId,
      roadtripId: step.roadtripId,
      type: type || 'OTHER',
      name,
      location: location || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      startTime: startTime ? toUTCDate(startTime) : null,
      endTime: endTime ? toUTCDate(endTime) : null,
      bookingRef: bookingRef || null,
      bookingUrl: bookingUrl || null,
      cost: cost ?? null,
      currency: currency || 'EUR',
      notes: notes || null,
      status: status || 'PLANNED',
      order: order ?? 0,
    },
  });

  res.status(201).json(activity);

  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'activité ajoutée');
});

// PUT /api/activities/:id — upsert (EDITOR+, ID généré côté client)
router.put('/:id', async (req, res) => {
  const { stepId, type, name, location, latitude, longitude, startTime, endTime, bookingRef, bookingUrl, cost, currency, notes, status, order } = req.body;

  if (!stepId) return res.status(400).json({ error: 'stepId is required' });

  const role = await getUserRoleViaStep(stepId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Step not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.findUnique({ where: { id: stepId }, select: { roadtripId: true } });

  const activity = await prisma.activity.upsert({
    where: { id: req.params.id },
    create: {
      id: req.params.id,
      stepId,
      userId: req.user.userId,
      roadtripId: step.roadtripId,
      type: type || 'OTHER',
      name: name || 'Activité',
      location: location || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      startTime: startTime ? toUTCDate(startTime) : null,
      endTime: endTime ? toUTCDate(endTime) : null,
      bookingRef: bookingRef || null,
      bookingUrl: bookingUrl || null,
      cost: cost ?? null,
      currency: currency || 'EUR',
      notes: notes || null,
      status: status || 'PLANNED',
      order: order ?? 0,
    },
    update: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(startTime !== undefined && { startTime: startTime ? toUTCDate(startTime) : null }),
      ...(endTime !== undefined && { endTime: endTime ? toUTCDate(endTime) : null }),
      ...(bookingRef !== undefined && { bookingRef }),
      ...(bookingUrl !== undefined && { bookingUrl }),
      ...(cost !== undefined && { cost }),
      ...(currency !== undefined && { currency }),
      ...(notes !== undefined && { notes }),
      ...(status !== undefined && { status }),
      ...(order !== undefined && { order }),
    },
  });

  res.json(activity);

  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'activité modifiée');
});

// PATCH /api/activities/:id — modification partielle (EDITOR+)
router.patch('/:id', async (req, res) => {
  const activity = await prisma.activity.findFirst({
    where: { id: req.params.id },
    select: { stepId: true },
  });

  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const role = await getUserRoleViaStep(activity.stepId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const { type, name, location, latitude, longitude, startTime, endTime, bookingRef, bookingUrl, cost, currency, notes, status, order } = req.body;

  const updated = await prisma.activity.update({
    where: { id: req.params.id },
    data: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(startTime !== undefined && { startTime: startTime ? toUTCDate(startTime) : null }),
      ...(endTime !== undefined && { endTime: endTime ? toUTCDate(endTime) : null }),
      ...(bookingRef !== undefined && { bookingRef }),
      ...(bookingUrl !== undefined && { bookingUrl }),
      ...(cost !== undefined && { cost }),
      ...(currency !== undefined && { currency }),
      ...(notes !== undefined && { notes }),
      ...(status !== undefined && { status }),
      ...(order !== undefined && { order }),
    },
  });

  res.json(updated);

  // Notifier les co-membres (non bloquant, agrégé)
  const stepForNotif = await prisma.step.findUnique({ where: { id: activity.stepId }, select: { roadtripId: true } });
  if (stepForNotif) notifyRoadtripMembers(stepForNotif.roadtripId, req.user.userId, 'activité modifiée');
});

// DELETE /api/activities/:id — suppression (EDITOR+)
router.delete('/:id', async (req, res) => {
  const activity = await prisma.activity.findFirst({
    where: { id: req.params.id },
    select: { stepId: true },
  });

  if (!activity) return res.status(404).json({ error: 'Activity not found' });

  const role = await getUserRoleViaStep(activity.stepId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const stepDel = await prisma.step.findUnique({ where: { id: activity.stepId }, select: { roadtripId: true } });
  await prisma.activity.delete({ where: { id: req.params.id } });

  res.status(204).send();

  if (stepDel) notifyRoadtripMembers(stepDel.roadtripId, req.user.userId, 'activité supprimée');
});

module.exports = router;
