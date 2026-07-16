const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getUserRoleOnRoadtrip } = require('../lib/roleHelpers');
const { notifyRoadtripMembers } = require('../lib/notify');

router.use(auth);

// GET /api/steps?roadtripId=
router.get('/', async (req, res) => {
  const { roadtripId } = req.query;

  if (!roadtripId) {
    return res.status(400).json({ error: 'roadtripId query param is required' });
  }

  const role = await getUserRoleOnRoadtrip(roadtripId, req.user.userId);
  if (!role) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const steps = await prisma.step.findMany({
    where: { roadtripId },
    orderBy: { order: 'asc' },
    include: {
      accommodations: true,
      activities: { orderBy: { startTime: 'asc' } },
    },
  });

  res.json(steps);
});

// POST /api/steps — écriture : EDITOR+
router.post('/', async (req, res) => {
  const {
    roadtripId, name, location, latitude, longitude,
    startDate, endDate, arrivalTime, departureTime, notes, photoUrl, order,
  } = req.body;

  if (!roadtripId || !name) {
    return res.status(400).json({ error: 'roadtripId and name are required' });
  }

  const role = await getUserRoleOnRoadtrip(roadtripId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Roadtrip not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.create({
    data: {
      roadtripId,
      userId: req.user.userId,
      name,
      location: location || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      arrivalTime: arrivalTime || null,
      departureTime: departureTime || null,
      notes: notes || null,
      photoUrl: photoUrl || null,
      order: order ?? 0,
    },
  });

  // Notifier les co-membres (non bloquant, agrégé)
  notifyRoadtripMembers(roadtripId, req.user.userId, 'étape ajoutée');
  res.status(201).json(step);
});

// PUT /api/steps/:id — upsert (EDITOR+, ID généré côté client)
router.put('/:id', async (req, res) => {
  const {
    roadtripId, name, location, latitude, longitude,
    startDate, endDate, arrivalTime, departureTime, notes, photoUrl, order,
    routeDurationSeconds, routeDistanceMeters, routeEncodedPolyline,
  } = req.body;

  if (!roadtripId) return res.status(400).json({ error: 'roadtripId is required' });

  const role = await getUserRoleOnRoadtrip(roadtripId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Roadtrip not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.upsert({
    where: { id: req.params.id },
    create: {
      id: req.params.id,
      roadtripId,
      userId: req.user.userId,
      name: name || 'Nouvelle étape',
      location: location || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      arrivalTime: arrivalTime || null,
      departureTime: departureTime || null,
      notes: notes || null,
      photoUrl: photoUrl || null,
      order: order ?? 0,
    },
    update: {
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(arrivalTime !== undefined && { arrivalTime }),
      ...(departureTime !== undefined && { departureTime }),
      ...(notes !== undefined && { notes }),
      ...(photoUrl !== undefined && { photoUrl }),
      ...(order !== undefined && { order }),
      ...(routeDurationSeconds !== undefined && { routeDurationSeconds: routeDurationSeconds ?? null }),
      ...(routeDistanceMeters !== undefined && { routeDistanceMeters: routeDistanceMeters ?? null }),
      ...(routeEncodedPolyline !== undefined && { routeEncodedPolyline: routeEncodedPolyline ?? null }),
    },
    include: { accommodations: true, activities: true },
  });

  res.json(step);

  // Notifier les co-membres (non bloquant, agrégé)
  notifyRoadtripMembers(roadtripId, req.user.userId, 'étape modifiée');
});

// PATCH /api/steps/:id — modification partielle (EDITOR+)
router.patch('/:id', async (req, res) => {
  const step = await prisma.step.findFirst({
    where: { id: req.params.id },
    select: { roadtripId: true },
  });

  if (!step) return res.status(404).json({ error: 'Step not found' });

  const role = await getUserRoleOnRoadtrip(step.roadtripId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const {
    name, location, latitude, longitude,
    departureLatitude, departureLongitude, arrivalLatitude, arrivalLongitude,
    startDate, endDate, arrivalTime, departureTime, notes, photoUrl, order,
    routeDurationSeconds, routeDistanceMeters, routeEncodedPolyline,
  } = req.body;

  const updated = await prisma.step.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(location !== undefined && { location }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(departureLatitude !== undefined && { departureLatitude }),
      ...(departureLongitude !== undefined && { departureLongitude }),
      ...(arrivalLatitude !== undefined && { arrivalLatitude }),
      ...(arrivalLongitude !== undefined && { arrivalLongitude }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(arrivalTime !== undefined && { arrivalTime }),
      ...(departureTime !== undefined && { departureTime }),
      ...(notes !== undefined && { notes }),
      ...(photoUrl !== undefined && { photoUrl }),
      ...(order !== undefined && { order }),
      ...(routeDurationSeconds !== undefined && { routeDurationSeconds: routeDurationSeconds ?? null }),
      ...(routeDistanceMeters !== undefined && { routeDistanceMeters: routeDistanceMeters ?? null }),
      ...(routeEncodedPolyline !== undefined && { routeEncodedPolyline: routeEncodedPolyline ?? null }),
    },
    include: { accommodations: true, activities: { orderBy: { startTime: 'asc' } } },
  });

  res.json(updated);

  // Notifier les co-membres (non bloquant, agrégé)
  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'étape modifiée');
});

// PATCH /api/steps/reorder — met à jour l'ordre de plusieurs étapes en une transaction
router.patch('/reorder', async (req, res) => {
  const { roadtripId, order } = req.body;
  // order : [{ id: string, order: number }, ...]

  if (!roadtripId || !Array.isArray(order)) {
    return res.status(400).json({ error: 'roadtripId et order[] sont requis' });
  }

  const role = await getUserRoleOnRoadtrip(roadtripId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Roadtrip not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  await prisma.$transaction(
    order.map(({ id, order: o }) =>
      prisma.step.update({ where: { id }, data: { order: o } })
    )
  );

  res.status(204).send();
});

// DELETE /api/steps/:id — suppression (EDITOR+)
router.delete('/:id', async (req, res) => {
  const step = await prisma.step.findFirst({
    where: { id: req.params.id },
    select: { roadtripId: true },
  });

  if (!step) return res.status(404).json({ error: 'Step not found' });

  const role = await getUserRoleOnRoadtrip(step.roadtripId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  await prisma.step.delete({ where: { id: req.params.id } });

  res.status(204).send();

  // Notifier les co-membres (non bloquant, agrégé)
  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'étape supprimée');
});

module.exports = router;
