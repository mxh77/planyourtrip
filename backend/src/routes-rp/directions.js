/**
 * routes/directions.js — Calcul d'itinéraires routiers
 */
const express = require('express');
const gm      = require('../services/googleMaps');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ── Helper: parse JSON fields du waypoint ─────────────────────────────────────
function parseWp(wp) {
  const fields = ['selectedCamping', 'campings', 'trails', 'trailResults', 'pois', 'p4n', 'activeOverlays'];
  const out = { ...wp };
  for (const k of fields) {
    if (out[k] && typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch (_) {}
    }
  }
  return out;
}

// ── Recalcul de tous les segments d'un itinéraire ────────────────────────────
async function recalculateRoutes(itineraryId, io) {
  try {
    const itinerary = await prisma.itinerary.findUnique({
      where:   { id: itineraryId },
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });
    if (!itinerary) return;

    const wps = itinerary.waypoints;

    // Reset 1er waypoint
    if (wps.length > 0) {
      const first = await prisma.waypoint.update({
        where: { id: wps[0].id },
        data:  { distanceFromPrev: null, durationFromPrev: null, routePolyline: null },
      });
      io?.to(`itinerary:${itineraryId}`).emit('waypoint:updated', parseWp(first));
    }

    if (wps.length < 2) return;

    let totalDistance = 0;
    let totalDuration = 0;

    // Calcul segment par segment (séquentiel pour éviter rate limiting)
    for (let i = 1; i < wps.length; i++) {
      const from = wps[i - 1];
      const to   = wps[i];
      try {
        const route = await gm.getDirections({
          origin:      `${from.lat},${from.lng}`,
          destination: `${to.lat},${to.lng}`,
          mode:        'driving',
        });
        if (route) {
          const dist = route.totalDistance;                   // km
          const dur  = Math.round(route.totalDuration / 60); // minutes
          totalDistance += dist;
          totalDuration += dur;
          const updated = await prisma.waypoint.update({
            where: { id: to.id },
            data:  { distanceFromPrev: dist, durationFromPrev: dur, routePolyline: route.polyline },
          });
          io?.to(`itinerary:${itineraryId}`).emit('waypoint:updated', parseWp(updated));
        }
      } catch (err) {
        console.error(`[directions] segment ${i} error:`, err.message);
        // On continue les autres segments même si un échoue
      }
    }

    // Mise à jour totaux
    await prisma.itinerary.update({
      where: { id: itineraryId },
      data:  { totalDistance, totalDuration },
    });

    io?.to(`itinerary:${itineraryId}`).emit('route:calculated', { totalDistance, totalDuration });
    console.log(`[directions] Itinéraire ${itineraryId} recalculé: ${totalDistance.toFixed(1)}km, ${totalDuration}min`);
  } catch (err) {
    console.error('[directions] recalculateRoutes error:', err.message);
  }
}

// GET /api/directions?origin=&destination=&waypoints=&mode=
router.get('/', async (req, res, next) => {
  try {
    const { origin, destination, waypoints, mode = 'driving', language = 'fr' } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'origin/destination requis' });

    const wps = waypoints ? waypoints.split('|').filter(Boolean) : [];
    const result = await gm.getDirections({ origin, destination, waypoints: wps, mode, language });
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/directions/itinerary/:id — Calcule et sauvegarde les distances
router.post('/itinerary/:id', async (req, res, next) => {
  try {
    const io = req.app.get('io');
    // Lance le recalcul (async, répond immédiatement)
    recalculateRoutes(req.params.id, io).catch(() => {});
    res.json({ ok: true, message: 'Recalcul en cours…' });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.recalculateRoutes = recalculateRoutes;

// GET /api/directions?origin=&destination=&waypoints=&mode=
router.get('/', async (req, res, next) => {
  try {
    const { origin, destination, waypoints, mode = 'driving', language = 'fr' } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: 'origin/destination requis' });

    const wps = waypoints ? waypoints.split('|') : [];
    const result = await gm.getDirections({ origin, destination, waypoints: wps, mode, language });
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/directions/itinerary/:id — Calcule et sauvegarde les distances
router.post('/itinerary/:id', async (req, res, next) => {
  try {
    const itinerary = await prisma.itinerary.findUnique({
      where:   { id: req.params.id },
      include: { waypoints: { orderBy: { order: 'asc' } } },
    });
    if (!itinerary) return res.status(404).json({ error: 'Itinéraire non trouvé' });

    const wps = itinerary.waypoints;
    if (wps.length < 2) return res.json({ totalDistance: 0, totalDuration: 0, legs: [] });

    // Calcule la route complète
    const origin      = `${wps[0].lat},${wps[0].lng}`;
    const destination = `${wps[wps.length - 1].lat},${wps[wps.length - 1].lng}`;
    const midpoints   = wps.slice(1, -1).map(w => `${w.lat},${w.lng}`);

    const route = await gm.getDirections({ origin, destination, waypoints: midpoints, mode: 'driving' });
    if (!route) return res.status(502).json({ error: 'Calcul d\'itinéraire échoué' });

    // Met à jour distances/durées dans la DB
    const updates = [];
    for (let i = 1; i < wps.length; i++) {
      const leg = route.legs[i - 1];
      if (leg) {
        updates.push(prisma.waypoint.update({
          where: { id: wps[i].id },
          data:  {
            distanceFromPrev: leg.distance.value / 1000,
            durationFromPrev: leg.duration.value / 60,
          },
        }));
      }
    }

    // Met à jour totaux sur l'itinéraire
    updates.push(prisma.itinerary.update({
      where: { id: req.params.id },
      data:  {
        totalDistance: route.totalDistance,
        totalDuration: Math.round(route.totalDuration / 60),
      },
    }));

    await prisma.$transaction(updates);

    res.json({
      totalDistance: route.totalDistance,
      totalDuration: Math.round(route.totalDuration / 60),
      polyline:      route.polyline,
      legs:          route.legs,
    });
  } catch (e) { next(e); }
});

module.exports = router;
