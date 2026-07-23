/**
 * routes/ai.js — Chat IA avec streaming SSE + historique
 */
const express      = require('express');
const { PrismaClient } = require('@prisma/client');
const aiSvc        = require('../services/openai');
const timeChecker  = require('../services/timeCoherenceChecker');
const auth         = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
// Body: { message, itineraryId, stream?, preferences? }

router.post('/chat', async (req, res, next) => {
  try {
    const { message, itineraryId, stream = false, preferences = {}, model, selectedWaypointId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message requis' });

    // Récupère l'historique de la conversation
    let history = [];
    let itineraryContext = null;
    let selectedWaypoint = null;

    if (itineraryId) {
      const [messages, itinerary] = await Promise.all([
        prisma.chatMessage.findMany({
          where:   { itineraryId },
          orderBy: { createdAt: 'asc' },
          take:    30,
        }),
        prisma.itinerary.findUnique({
          where:   { id: itineraryId },
          include: { waypoints: { orderBy: { order: 'asc' } } },
        }),
      ]);
      history = messages.map(m => ({ role: m.role, content: m.content }));
      itineraryContext = itinerary;
      if (selectedWaypointId && itinerary?.waypoints) {
        selectedWaypoint = itinerary.waypoints.find(w => w.id === selectedWaypointId) ?? null;
      }
    }

    const allMessages = [...history, { role: 'user', content: message }];

    // ── Mode streaming SSE ───────────────────────────────────────────────────
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        // Première passe streaming pour afficher la réflexion initiale
        const streamResp = await aiSvc.chat({
          messages: allMessages, itineraryContext, selectedWaypoint, stream: true, preferences, model,
        });

        let fullContent = '';
        let pendingToolCalls = false;

        for await (const chunk of streamResp) {
          const delta = chunk.choices[0]?.delta;
          const finishReason = chunk.choices[0]?.finish_reason;
          if (delta?.content) {
            fullContent += delta.content;
            res.write(`data: ${JSON.stringify({ type: 'content', delta: delta.content })}\n\n`);
          }
          if (finishReason === 'tool_calls') {
            pendingToolCalls = true;
          }
          if (finishReason === 'stop') {
            if (itineraryId) {
              await prisma.chatMessage.createMany({
                data: [
                  { itineraryId, role: 'user',      content: message },
                  { itineraryId, role: 'assistant', content: fullContent },
                ],
              });
            }
            res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent })}\n\n`);
          }
        }

        // Si tool calls détectés → exécution complète en mode non-stream
        if (pendingToolCalls) {
          res.write(`data: ${JSON.stringify({ type: 'content', delta: '\n\n' })}\n\n`);
          const result = await aiSvc.chat({ messages: allMessages, itineraryContext, selectedWaypoint, preferences, model });
          const finalContent = result.content || '';
          res.write(`data: ${JSON.stringify({ type: 'content', delta: finalContent })}\n\n`);
          if (itineraryId) {
            await prisma.chatMessage.createMany({
              data: [
                { itineraryId, role: 'user',      content: message },
                { itineraryId, role: 'assistant', content: finalContent },
              ],
            });
          }
          res.write(`data: ${JSON.stringify({ type: 'done', content: finalContent })}\n\n`);
        }
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      }
      res.end();
      return;
    }

    // ── Mode normal (tool-calling complet) ───────────────────────────────────
    const result = await aiSvc.chat({ messages: allMessages, itineraryContext, selectedWaypoint, preferences, model });

    // Sauvegarde
    if (itineraryId) {
      await prisma.chatMessage.createMany({
        data: [
          { itineraryId, role: 'user',      content: message },
          { itineraryId, role: 'assistant', content: result.content || '',
            toolCalls: result.toolCalls?.length ? JSON.stringify(result.toolCalls) : null },
        ],
      });
    }

    res.json(result);
  } catch (e) { next(e); }
});

// ── POST /api/ai/suggest-itinerary ────────────────────────────────────────────
// Body: { departure, destination, duration, preferences }

router.post('/suggest-itinerary', async (req, res, next) => {
  try {
    const { departure, destination, duration = 7, preferences = {} } = req.body;
    if (!departure || !destination)
      return res.status(400).json({ error: 'departure et destination requis' });

    const result = await aiSvc.suggestItinerary({ departure, destination, duration, preferences });
    res.json(result);
  } catch (e) { next(e); }
});

// ── POST /api/ai/analyze-campings ─────────────────────────────────────────────
// Body: { campings, checkin, checkout, groupSize }

router.post('/analyze-campings', async (req, res, next) => {
  try {
    const { campings, checkin, checkout, groupSize = 2 } = req.body;
    if (!campings?.length) return res.status(400).json({ error: 'campings[] requis' });

    const result = await aiSvc.analyzeCampingConstraints({ campings, checkin, checkout, groupSize });
    res.json(result);
  } catch (e) { next(e); }
});

// ── GET /api/ai/chat/:itineraryId/history ────────────────────────────────────

router.get('/chat/:itineraryId/history', async (req, res, next) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where:   { itineraryId: req.params.itineraryId },
      orderBy: { createdAt: 'asc' },
      take:    100,
    });
    res.json(messages);
  } catch (e) { next(e); }
});

// ── DELETE /api/ai/chat/:itineraryId/history ─────────────────────────────────

router.delete('/chat/:itineraryId/history', async (req, res, next) => {
  try {
    await prisma.chatMessage.deleteMany({ where: { itineraryId: req.params.itineraryId } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── POST /api/ai/generate-description ────────────────────────────────────────

router.post('/generate-description', async (req, res, next) => {
  try {
    const { itinerary, model } = req.body;
    if (!itinerary) return res.status(400).json({ error: 'itinerary requis' });

    const result = await aiSvc.chat({
      messages: [{
        role:    'user',
        content: `Génère une belle description de voyage (5-8 phrases enthousiastes) pour cet itinéraire:\n${JSON.stringify({
          name:      itinerary.name,
          waypoints: itinerary.waypoints?.map(w => ({ name: w.name, nights: w.nights })),
        })}`,
      }],
      itineraryContext: itinerary,
      model,
    });
    res.json({ description: result.content });
  } catch (e) { next(e); }
});

// ── POST /api/ai/check-coherence ─────────────────────────────────────────────
// Analyse la cohérence temporelle d'un roadtrip (chevauchements, trous, etc.)
// Body: { roadtripId, thresholds?: { gapAfterArrival, gapBeforeDeparture, gapBetweenActivities, maxArrivalHour } }

router.post('/check-coherence', auth, async (req, res, next) => {
  try {
    const { roadtripId, thresholds } = req.body;
    if (!roadtripId) return res.status(400).json({ error: 'roadtripId requis' });

    const result = await timeChecker.checkTimeCoherence(roadtripId, thresholds || {});
    res.json(result);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ error: e.message });
    next(e);
  }
});

module.exports = router;
