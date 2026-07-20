/**
 * routes-rp/export.js — Export roadtrip complet au format JSON (sauvegarde)
 *
 * Exhaustif : toutes les données liées au roadtrip sont incluses :
 * - Infos générales + settings + owner + members
 * - Étapes (avec hébergements, activités)
 * - Photos (roadtrip, étapes, hébergements, activités)
 * - Documents (roadtrip, hébergements, activités)
 * - Todo items
 *
 * Gère les migrations DB automatiquement : utilise Prisma include
 * plutôt que des colonnes hardcodées — les nouveaux champs sont
 * inclus automatiquement sans modifier le code d'export.
 *
 * GET /api/roadtrips/:id/export
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// ── GET /api/roadtrips/:roadtripId/export ───────────────────────────────────
router.get('/:roadtripId/export', async (req, res, next) => {
  try {
    const { roadtripId } = req.params;

    // ── 1. Roadtrip avec toutes les relations Prisma ─────────────────────
    const roadtrip = await prisma.roadtrip.findUnique({
      where: { id: roadtripId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        steps: {
          orderBy: { order: 'asc' },
          include: {
            accommodations: {
              orderBy: { checkIn: 'asc' },
            },
            activities: {
              orderBy: { startTime: 'asc' },
            },
          },
        },
        todoitems: {
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!roadtrip) {
      return res.status(404).json({ error: 'Roadtrip not found' });
    }

    // ── 2. Photos liées au roadtrip (avec toutes les sous-entités) ───────
    const stepIds = roadtrip.steps.map(s => s.id);
    const accommodationIds = roadtrip.steps.flatMap(s =>
      s.accommodations.map(a => a.id)
    );
    const activityIds = roadtrip.steps.flatMap(s =>
      s.activities.map(a => a.id)
    );

    const photos = await prisma.photo.findMany({
      where: {
        OR: [
          { roadtripId },
          { stepId: { in: stepIds } },
          { accommodationId: { in: accommodationIds } },
          { activityId: { in: activityIds } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // ── 3. Documents liés au roadtrip ─────────────────────────────────────
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { roadtripId },
          { accommodationId: { in: accommodationIds } },
          { activityId: { in: activityIds } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // ── 4. Construire l'export structuré ──────────────────────────────────
    const exportData = {
      // Métadonnées de l'export
      meta: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        source: 'planyourtrip-api',
        roadtripId: roadtrip.id,
        roadtripTitle: roadtrip.title,
      },

      // Roadtrip
      roadtrip: {
        id: roadtrip.id,
        title: roadtrip.title,
        startDate: roadtrip.startDate,
        endDate: roadtrip.endDate,
        coverPhotoUrl: roadtrip.coverPhotoUrl,
        status: roadtrip.status,
        settings: roadtrip.settings,
        createdAt: roadtrip.createdAt,
        updatedAt: roadtrip.updatedAt,
        owner: roadtrip.user
          ? {
              id: roadtrip.user.id,
              name: roadtrip.user.name,
              email: roadtrip.user.email,
            }
          : null,
        members: roadtrip.members.map(m => ({
          id: m.id,
          role: m.role,
          status: m.status,
          invitedAt: m.invitedAt,
          joinedAt: m.joinedAt,
          email: m.email,
          user: m.user
            ? {
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
              }
            : null,
        })),
      },

      // Étapes
      steps: roadtrip.steps.map(step => ({
        id: step.id,
        name: step.name,
        location: step.location,
        latitude: step.latitude,
        longitude: step.longitude,
        departureLatitude: step.departureLatitude,
        departureLongitude: step.departureLongitude,
        arrivalLatitude: step.arrivalLatitude,
        arrivalLongitude: step.arrivalLongitude,
        startDate: step.startDate,
        endDate: step.endDate,
        arrivalTime: step.arrivalTime,
        departureTime: step.departureTime,
        notes: step.notes,
        photoUrl: step.photoUrl,
        order: step.order,
        routeDurationSeconds: step.routeDurationSeconds,
        routeDistanceMeters: step.routeDistanceMeters,
        routeEncodedPolyline: step.routeEncodedPolyline,
        createdAt: step.createdAt,
        updatedAt: step.updatedAt,

        // Hébergements
        accommodations: step.accommodations.map(acc => ({
          id: acc.id,
          type: acc.type,
          name: acc.name,
          address: acc.address,
          latitude: acc.latitude,
          longitude: acc.longitude,
          isDeparture: acc.isDeparture,
          isArrival: acc.isArrival,
          checkIn: acc.checkIn,
          checkOut: acc.checkOut,
          bookingRef: acc.bookingRef,
          bookingUrl: acc.bookingUrl,
          pricePerNight: acc.pricePerNight,
          totalPrice: acc.totalPrice,
          depositPaid: acc.depositPaid,
          currency: acc.currency,
          amenities: acc.amenities,
          notes: acc.notes,
          status: acc.status,
          createdAt: acc.createdAt,
          updatedAt: acc.updatedAt,
        })),

        // Activités
        activities: step.activities.map(act => ({
          id: act.id,
          type: act.type,
          name: act.name,
          location: act.location,
          latitude: act.latitude,
          longitude: act.longitude,
          isDeparture: act.isDeparture,
          isArrival: act.isArrival,
          startTime: act.startTime,
          endTime: act.endTime,
          bookingRef: act.bookingRef,
          bookingUrl: act.bookingUrl,
          cost: act.cost,
          depositPaid: act.depositPaid,
          currency: act.currency,
          notes: act.notes,
          status: act.status,
          order: act.order,
          createdAt: act.createdAt,
          updatedAt: act.updatedAt,
        })),
      })),

      // Photos
      photos: photos.map(p => ({
        id: p.id,
        url: p.url,
        cloudinaryId: p.cloudinaryId,
        name: p.name,
        caption: p.caption,
        isCover: p.isCover,
        takenAt: p.takenAt,
        createdAt: p.createdAt,
        roadtripId: p.roadtripId,
        stepId: p.stepId,
        accommodationId: p.accommodationId,
        activityId: p.activityId,
      })),

      // Documents
      documents: documents.map(d => ({
        id: d.id,
        url: d.url,
        storagePath: d.storagePath,
        originalName: d.originalName,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        name: d.name,
        caption: d.caption,
        createdAt: d.createdAt,
        roadtripId: d.roadtripId,
        accommodationId: d.accommodationId,
        activityId: d.activityId,
      })),

      // Todo items
      todos: roadtrip.todoitems.map(todo => ({
        id: todo.id,
        text: todo.text,
        done: todo.done,
        category: todo.category,
        notes: todo.notes,
        dueDate: todo.dueDate,
        country: todo.country,
        priority: todo.priority,
        order: todo.order,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      })),
    };

    res.json(exportData);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
