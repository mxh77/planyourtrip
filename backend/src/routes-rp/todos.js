/**
 * routes/todos.js — CRUD Todo list
 * GET    /api/todos       — liste toutes les tâches (triées par order)
 * POST   /api/todos       — créer une tâche
 * PATCH  /api/todos/:id   — modifier une tâche (text, done, category, priority, order)
 * DELETE /api/todos/:id   — supprimer une tâche
 * DELETE /api/todos       — supprimer toutes les tâches faites
 */
const express = require('express');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const TodoSchema = z.object({
  text:       z.string().min(1).max(500),
  roadtripId: z.string().min(1),
  done:       z.boolean().optional(),
  category:   z.enum(['equipement','sante','courses','admin','divers']).optional().nullable(),
  notes:      z.string().optional().nullable(),
  dueDate:    z.string().datetime().optional().nullable(),
  country:    z.string().optional().nullable(),
  priority:   z.number().int().min(0).max(2).optional(),
  order:      z.number().int().min(0).optional(),
});

const TodoPatchSchema = z.object({
  text:      z.string().min(1).max(500).optional(),
  done:      z.boolean().optional(),
  category:  z.enum(['equipement','sante','courses','admin','divers']).optional().nullable(),
  notes:     z.string().optional().nullable(),
  dueDate:   z.string().datetime().optional().nullable(),
  country:   z.string().optional().nullable(),
  priority:  z.number().int().min(0).max(2).optional(),
  order:     z.number().int().min(0).optional(),
});

// ── GET /api/todos?roadtripId=X ──────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { roadtripId } = req.query;
    if (!roadtripId) {
      return res.status(400).json({ error: 'roadtripId query parameter is required' });
    }
    const items = await prisma.todoItem.findMany({
      where: { roadtripId },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(items);
  } catch (e) { next(e); }
});

// ── POST /api/todos ─────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const data = TodoSchema.parse(req.body);
    const last = await prisma.todoItem.findFirst({
      where: { roadtripId: data.roadtripId },
      orderBy: { order: 'desc' },
    });
    const item = await prisma.todoItem.create({
      data: {
        text:       data.text,
        roadtripId: data.roadtripId,
        done:       data.done ?? false,
        category:   data.category ?? null,
        notes:      data.notes ?? null,
        dueDate:    data.dueDate ? new Date(data.dueDate) : null,
        country:    data.country ?? null,
        priority:   data.priority ?? 0,
        order:      data.order ?? (last ? last.order + 1 : 0),
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// ── PATCH /api/todos/:id ────────────────────────────────────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const data = TodoPatchSchema.parse(req.body);
    const patch = {};
    if (data.text     !== undefined) patch.text     = data.text;
    if (data.done     !== undefined) patch.done     = data.done;
    if (data.category !== undefined) patch.category = data.category;
    if (data.notes    !== undefined) patch.notes    = data.notes;
    if (data.dueDate  !== undefined) patch.dueDate  = data.dueDate ? new Date(data.dueDate) : null;
    if (data.country  !== undefined) patch.country  = data.country;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.order    !== undefined) patch.order    = data.order;
    const item = await prisma.todoItem.update({
      where: { id: req.params.id },
      data:  patch,
    });
    res.json(item);
  } catch (e) { next(e); }
});

// ── DELETE /api/todos/:id ───────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.todoItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── DELETE /api/todos?roadtripId=X ── supprimer toutes les tâches faites ────
router.delete('/', async (req, res, next) => {
  try {
    const { roadtripId } = req.query;
    if (!roadtripId) {
      return res.status(400).json({ error: 'roadtripId query parameter is required' });
    }
    const result = await prisma.todoItem.deleteMany({ where: { roadtripId, done: true } });
    res.json({ deleted: result.count });
  } catch (e) { next(e); }
});

module.exports = router;