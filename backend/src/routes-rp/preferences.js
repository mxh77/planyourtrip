/**
 * routes/preferences.js — Préférences utilisateur (singleton "default")
 * GET  /api/preferences        — récupère les préférences
 * PATCH /api/preferences       — met à jour les préférences
 */
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULT_FILTER = {
  minRating: 0,
  maxDistance: 50,
  requireParking: false,
  requirePool: false,
  requireWifi: false,
  vehicleTypes: [],
  trailDifficulty: [],
  trailMaxDistance: 0,
  p4nTypes: [],
};

// ── GET /api/preferences ──────────────────────────────────────────────────────
router.get('/', async (_req, res, next) => {
  try {
    const prefs = await prisma.userPreferences.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });

    res.json({
      ...prefs,
      mapFilter: prefs.mapFilter ? JSON.parse(prefs.mapFilter) : DEFAULT_FILTER,
    });
  } catch (e) { next(e); }
});

// ── PATCH /api/preferences ────────────────────────────────────────────────────
router.patch('/', async (req, res, next) => {
  try {
    const { mapFilter, ...rest } = req.body;

    const data = { ...rest };
    if (mapFilter !== undefined) {
      data.mapFilter = JSON.stringify(mapFilter);
    }

    const prefs = await prisma.userPreferences.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });

    res.json({
      ...prefs,
      mapFilter: prefs.mapFilter ? JSON.parse(prefs.mapFilter) : DEFAULT_FILTER,
    });
  } catch (e) { next(e); }
});

module.exports = router;
