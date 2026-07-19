const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { getUserRoleViaStep } = require('../lib/roleHelpers');
const { notifyRoadtripMembers } = require('../lib/notify');

// Crée une Date dont l'heure UTC correspond à l'heure saisie (préserve "05:00" quels que soient le fuseau et la saison)
function toUTCDate(str) {
  if (!str) return null;
  const [ymd, hhmm] = str.split(' ');
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [y, m, d] = parts;
  if (hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return null;
    return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0));
  }
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

router.use(auth);

// POST /api/accommodations — écriture : EDITOR+
router.post('/', async (req, res) => {
  const { stepId, type, name, address, latitude, longitude, checkIn, checkOut, bookingRef, bookingUrl, pricePerNight, totalPrice, depositPaid, currency, amenities, notes, status } = req.body;

  if (!stepId || !name) {
    return res.status(400).json({ error: 'stepId and name are required' });
  }

  const role = await getUserRoleViaStep(stepId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Step not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.findUnique({ where: { id: stepId }, select: { roadtripId: true } });

  const accommodation = await prisma.accommodation.create({
    data: {
      stepId,
      userId: req.user.userId,
      roadtripId: step.roadtripId,
      type: type || 'HOTEL',
      name,
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      checkIn: checkIn ? toUTCDate(checkIn) : null,
      checkOut: checkOut ? toUTCDate(checkOut) : null,
      bookingRef: bookingRef || null,
      bookingUrl: bookingUrl || null,
      pricePerNight: pricePerNight ?? null,
      totalPrice: totalPrice ?? null,
      depositPaid: depositPaid ?? null,
      currency: currency || 'EUR',
      amenities: amenities || null,
      notes: notes || null,
      status: status || 'PLANNED',
    },
  });

  res.status(201).json(accommodation);

  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'hébergement ajouté');
});

// PUT /api/accommodations/:id — upsert (EDITOR+, ID généré côté client)
router.put('/:id', async (req, res) => {
  const { stepId, type, name, address, latitude, longitude, isDeparture, isArrival, checkIn, checkOut, bookingRef, bookingUrl, pricePerNight, totalPrice, depositPaid, currency, amenities, notes, status } = req.body;

  if (!stepId) return res.status(400).json({ error: 'stepId is required' });

  const role = await getUserRoleViaStep(stepId, req.user.userId);
  if (!role) return res.status(404).json({ error: 'Step not found' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const step = await prisma.step.findUnique({ where: { id: stepId }, select: { roadtripId: true } });

  const accommodation = await prisma.accommodation.upsert({
    where: { id: req.params.id },
    create: {
      id: req.params.id,
      stepId,
      userId: req.user.userId,
      roadtripId: step.roadtripId,
      type: type || 'HOTEL',
      name: name || 'Hébergement',
      address: address || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      isDeparture: !!isDeparture ?? false,
      isArrival: !!isArrival ?? false,
      checkIn: checkIn ? toUTCDate(checkIn) : null,
      checkOut: checkOut ? toUTCDate(checkOut) : null,
      bookingRef: bookingRef || null,
      bookingUrl: bookingUrl || null,
      pricePerNight: pricePerNight ?? null,
      totalPrice: totalPrice ?? null,
      depositPaid: depositPaid ?? null,
      currency: currency || 'EUR',
      amenities: amenities || null,
      notes: notes || null,
      status: status || 'PLANNED',
    },
    update: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(isDeparture !== undefined && { isDeparture: !!isDeparture }),
      ...(isArrival !== undefined && { isArrival: !!isArrival }),
      ...(checkIn !== undefined && { checkIn: checkIn ? toUTCDate(checkIn) : null }),
      ...(checkOut !== undefined && { checkOut: checkOut ? toUTCDate(checkOut) : null }),
      ...(bookingRef !== undefined && { bookingRef }),
      ...(bookingUrl !== undefined && { bookingUrl }),
      ...(pricePerNight !== undefined && { pricePerNight }),
      ...(totalPrice !== undefined && { totalPrice }),
      ...(depositPaid !== undefined && { depositPaid }),
      ...(currency !== undefined && { currency }),
      ...(amenities !== undefined && { amenities }),
      ...(notes !== undefined && { notes }),
      ...(status !== undefined && { status }),
    },
  });

  res.json(accommodation);

  notifyRoadtripMembers(step.roadtripId, req.user.userId, 'hébergement modifié');
});

// PATCH /api/accommodations/:id — modification partielle (EDITOR+)
router.patch('/:id', async (req, res) => {
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: req.params.id },
    select: { stepId: true },
  });

  if (!accommodation) return res.status(404).json({ error: 'Accommodation not found' });

  const role = await getUserRoleViaStep(accommodation.stepId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const { type, name, address, latitude, longitude, isDeparture, isArrival, checkIn, checkOut, bookingRef, bookingUrl, pricePerNight, totalPrice, depositPaid, currency, amenities, notes, status } = req.body;

  const updated = await prisma.accommodation.update({
    where: { id: req.params.id },
    data: {
      ...(type !== undefined && { type }),
      ...(name !== undefined && { name }),
      ...(address !== undefined && { address }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(isDeparture !== undefined && { isDeparture: !!isDeparture }),
      ...(isArrival !== undefined && { isArrival: !!isArrival }),
      ...(checkIn !== undefined && { checkIn: checkIn ? toUTCDate(checkIn) : null }),
      ...(checkOut !== undefined && { checkOut: checkOut ? toUTCDate(checkOut) : null }),
      ...(bookingRef !== undefined && { bookingRef }),
      ...(bookingUrl !== undefined && { bookingUrl }),
      ...(pricePerNight !== undefined && { pricePerNight }),
      ...(totalPrice !== undefined && { totalPrice }),
      ...(depositPaid !== undefined && { depositPaid }),
      ...(currency !== undefined && { currency }),
      ...(amenities !== undefined && { amenities }),
      ...(notes !== undefined && { notes }),
      ...(status !== undefined && { status }),
    },
  });

  res.json(updated);

  // Notifier les co-membres (non bloquant, agrégé)
  const stepForNotif = await prisma.step.findUnique({ where: { id: accommodation.stepId }, select: { roadtripId: true } });
  if (stepForNotif) notifyRoadtripMembers(stepForNotif.roadtripId, req.user.userId, 'hébergement modifié');
});

// DELETE /api/accommodations/:id — suppression (EDITOR+)
router.delete('/:id', async (req, res) => {
  const accommodation = await prisma.accommodation.findFirst({
    where: { id: req.params.id },
    select: { stepId: true },
  });

  if (!accommodation) return res.status(404).json({ error: 'Accommodation not found' });

  const role = await getUserRoleViaStep(accommodation.stepId, req.user.userId);
  if (!role) return res.status(403).json({ error: 'Access denied' });
  if (role === 'VIEWER') return res.status(403).json({ error: 'Role EDITOR required' });

  const stepDel = await prisma.step.findUnique({ where: { id: accommodation.stepId }, select: { roadtripId: true } });
  await prisma.accommodation.delete({ where: { id: req.params.id } });

  res.status(204).send();

  if (stepDel) notifyRoadtripMembers(stepDel.roadtripId, req.user.userId, 'hébergement supprimé');
});

module.exports = router;
