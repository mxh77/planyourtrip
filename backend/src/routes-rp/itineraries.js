/**
 * routes/itineraries.js — CRUD itinéraires + waypoints
 */
const express      = require('express');
const { z }        = require('zod');
const { PrismaClient } = require('@prisma/client');
const { recalculateRoutes } = require('./directions');

const router = express.Router();
const prisma = new PrismaClient();

// ── Schemas de validation ─────────────────────────────────────────────────────

const WaypointSchema = z.object({
  name:    z.string().min(1),
  address: z.string().optional(),
  lat:     z.number(),
  lng:     z.number(),
  order:   z.number().int().min(0).optional(),
  nights:  z.number().int().min(0).default(1),
  checkin:       z.string().optional().nullable(),
  checkout:      z.string().optional().nullable(),
  departureTime: z.string().optional().nullable(),
  arrivalTime:   z.string().optional().nullable(),
  notes:   z.string().optional().nullable(),
});

const ItinerarySchema = z.object({
  name:        z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  preferences: z.any().optional(),
});

// ── GET /api/itineraries ──────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.itinerary.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { waypoints: true } } },
    });
    res.json(items);
  } catch (e) { next(e); }
});

// ── POST /api/itineraries ─────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const data = ItinerarySchema.parse(req.body);
    const item = await prisma.itinerary.create({
      data: {
        name:        data.name,
        description: data.description,
        preferences: data.preferences ? JSON.stringify(data.preferences) : null,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// ── GET /api/itineraries/:id ──────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const item = await prisma.itinerary.findUnique({
      where:   { id: req.params.id },
      include: {
        waypoints: { orderBy: { order: 'asc' } },
        messages:  { orderBy: { createdAt: 'asc' }, take: 100 },
      },
    });
    if (!item) return res.status(404).json({ error: 'Itinéraire non trouvé' });

    // Parse JSON fields
    item.waypoints = item.waypoints.map(parseWaypointJson);
    if (item.preferences) item.preferences = tryParse(item.preferences);

    res.json(item);
  } catch (e) { next(e); }
});

// ── PATCH /api/itineraries/:id ────────────────────────────────────────────────

router.patch('/:id', async (req, res, next) => {
  try {
    const data  = ItinerarySchema.partial().parse(req.body);
    const patch = {};
    if (data.name        !== undefined) patch.name        = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.preferences !== undefined) patch.preferences = JSON.stringify(data.preferences);

    const item = await prisma.itinerary.update({
      where: { id: req.params.id },
      data:  patch,
    });

    // Broadcast via Socket.io
    req.app.get('io')?.to(`itinerary:${req.params.id}`).emit('itinerary:updated', item);
    res.json(item);
  } catch (e) { next(e); }
});

// ── DELETE /api/itineraries/:id ───────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.itinerary.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── POST /api/itineraries/:id/waypoints ──────────────────────────────────────

router.post('/:id/waypoints', async (req, res, next) => {
  try {
    const itinerary = await prisma.itinerary.findUnique({ where: { id: req.params.id } });
    if (!itinerary) return res.status(404).json({ error: 'Itinéraire non trouvé' });

    const data = WaypointSchema.parse(req.body);
    // Auto-calcul de l'ordre si non fourni
    if (data.order === undefined) {
      const count = await prisma.waypoint.count({ where: { itineraryId: req.params.id } });
      data.order = count + 1;
    }
    const wp   = await prisma.waypoint.create({
      data: {
        itineraryId: req.params.id,
        ...data,
        selectedCamping: req.body.selectedCamping ? JSON.stringify(req.body.selectedCamping) : null,
      },
    });

    const result = parseWaypointJson(wp);
    req.app.get('io')?.to(`itinerary:${req.params.id}`).emit('waypoint:added', result);
    // Recalcul async des routes (ne bloque pas la réponse)
    recalculateRoutes(req.params.id, req.app.get('io')).catch(() => {});
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ── PATCH /api/itineraries/:id/waypoints/:wpId ───────────────────────────────

router.patch('/:id/waypoints/:wpId', async (req, res, next) => {
  try {
    const allowed = ['name','address','lat','lng','order','nights','checkin','checkout','departureTime','arrivalTime','notes',
                     'selectedCamping','campings','trails','trailResults','pois','p4n','distanceFromPrev','durationFromPrev','routePolyline','activeOverlays'];    const positionChanged = req.body.lat !== undefined || req.body.lng !== undefined;
    const patch = {};

    const bodyKeys = Object.keys(req.body);
    console.log(`[PATCH wp] keys=${bodyKeys.join(',')}, has_p4n=${req.body.p4n !== undefined}, p4n_len=${Array.isArray(req.body.p4n) ? req.body.p4n.length : 'N/A'}`);

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const jsonFields = ['selectedCamping','campings','trails','trailResults','pois','p4n','activeOverlays'];
        patch[key] = jsonFields.includes(key)
          ? (req.body[key] !== null ? JSON.stringify(req.body[key]) : null)
          : req.body[key];
      }
    }

    const wp = await prisma.waypoint.update({
      where: { id: req.params.wpId },
      data:  patch,
    });

    const result = parseWaypointJson(wp);
    req.app.get('io')?.to(`itinerary:${req.params.id}`).emit('waypoint:updated', result);
    // Recalcul si la position a changé
    if (positionChanged) recalculateRoutes(req.params.id, req.app.get('io')).catch(() => {});
    res.json(result);
  } catch (e) { next(e); }
});

// ── DELETE /api/itineraries/:id/waypoints/:wpId ──────────────────────────────

router.delete('/:id/waypoints/:wpId', async (req, res, next) => {
  try {
    await prisma.waypoint.delete({ where: { id: req.params.wpId } });
    req.app.get('io')?.to(`itinerary:${req.params.id}`).emit('waypoint:deleted', { id: req.params.wpId });
    recalculateRoutes(req.params.id, req.app.get('io')).catch(() => {});
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── PUT /api/itineraries/:id/waypoints/reorder ───────────────────────────────

router.put('/:id/waypoints/reorder', async (req, res, next) => {
  try {
    const { order } = req.body; // [{ id, order }, ...]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] requis' });

    await prisma.$transaction(
      order.map(({ id, order: o }) => prisma.waypoint.update({ where: { id }, data: { order: o } }))
    );

    req.app.get('io')?.to(`itinerary:${req.params.id}`).emit('waypoints:reordered', order);
    recalculateRoutes(req.params.id, req.app.get('io')).catch(() => {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseWaypointJson(wp) {
  const json = ['selectedCamping', 'campings', 'trails', 'trailResults', 'pois', 'p4n', 'activeOverlays'];
  const out  = { ...wp };
  for (const k of json) {
    if (out[k] && typeof out[k] === 'string') out[k] = tryParse(out[k]);
  }
  return out;
}

function tryParse(str) {
  try { return JSON.parse(str); } catch (_) { return str; }
}

module.exports = router;
