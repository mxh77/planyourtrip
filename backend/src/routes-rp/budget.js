/**
 * routes-rp/budget.js — Budget & Dépenses
 *
 * Agrégation complète du budget d'un roadtrip :
 * - Hébergements (totalPrice / depositPaid)
 * - Activités (cost / depositPaid)
 * - Dépenses custom (Expense model)
 * - Estimation essence (via routeDistanceMeters)
 *
 * GET    /api/roadtrips/:id/budget              → Agrégation complète
 * GET    /api/roadtrips/:id/budget/daily         → Budget par jour
 * POST   /api/roadtrips/:id/expenses            → Créer dépense
 * PATCH  /api/roadtrips/:id/expenses/:expenseId → Modifier dépense
 * DELETE /api/roadtrips/:id/expenses/:expenseId → Supprimer dépense
 * PATCH  /api/roadtrips/:id/budget-settings     → Budget target + fuel settings
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

router.use(auth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}

function calcNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const diff = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  return diff > 0 ? diff : null;
}

// ─── GET /api/roadtrips/:id/budget ───────────────────────────────────────────

router.get('/:id/budget', async (req, res, next) => {
  try {
    const roadtrip = await prisma.roadtrip.findUnique({
      where: { id: req.params.id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            accommodations: true,
            activities: { orderBy: { startTime: 'asc' } },
          },
        },
        expenses: { orderBy: { date: 'asc' } },
      },
    });

    if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });

    // ── 1. Hébergements ─────────────────────────────────────────────────
    let accomTotal = 0;
    let accomDeposits = 0;
    let accomCount = 0;
    const byStepAccom = {};

    for (const step of roadtrip.steps) {
      let stepAccom = 0;
      for (const a of step.accommodations) {
        const total = a.totalPrice
          ?? (a.pricePerNight && calcNights(a.checkIn, a.checkOut)
            ? a.pricePerNight * calcNights(a.checkIn, a.checkOut)
            : 0);
        stepAccom += total;
        accomTotal += total;
        accomDeposits += a.depositPaid || 0;
        accomCount++;
      }
      if (stepAccom > 0) byStepAccom[step.id] = stepAccom;
    }

    // ── 2. Activités ───────────────────────────────────────────────────
    let activityTotal = 0;
    let activityDeposits = 0;
    let activityCount = 0;
    const byStepActivity = {};

    for (const step of roadtrip.steps) {
      let stepAct = 0;
      for (const act of step.activities) {
        stepAct += act.cost || 0;
        activityTotal += act.cost || 0;
        activityDeposits += act.depositPaid || 0;
        activityCount++;
      }
      if (stepAct > 0) byStepActivity[step.id] = stepAct;
    }

    // ── 3. Dépenses custom ─────────────────────────────────────────────
    const expenses = roadtrip.expenses || [];
    const expensesByCategory = {};
    let expensesTotal = 0;
    let expensesPaid = 0;

    for (const e of expenses) {
      const cat = e.category || 'OTHER';
      if (!expensesByCategory[cat]) expensesByCategory[cat] = { total: 0, count: 0, items: [] };
      expensesByCategory[cat].total += e.amount || 0;
      expensesByCategory[cat].count++;
      expensesByCategory[cat].items.push(e);
      expensesTotal += e.amount || 0;
      if (e.paid) expensesPaid += e.amount || 0;
    }

    // ── 4. Budget par étape ────────────────────────────────────────────
    const budgetByStep = roadtrip.steps.map(step => {
      const accom = byStepAccom[step.id] || 0;
      const activities = byStepActivity[step.id] || 0;
      const stepExpenses = sum(expenses.filter(e => e.stepId === step.id), e => e.amount || 0);
      return {
        stepId: step.id,
        stepName: step.name,
        stepOrder: step.order,
        accommodation: accom,
        activities,
        expenses: stepExpenses,
        total: accom + activities + stepExpenses,
      };
    });

    // ── 5. Estimation essence ──────────────────────────────────────────
    const totalKm = sum(roadtrip.steps, s => s.routeDistanceMeters || 0) / 1000;
    let estimatedFuelCost = null;
    if (roadtrip.fuelConsumption && roadtrip.fuelPricePerL && totalKm > 0) {
      estimatedFuelCost = (totalKm / 100) * roadtrip.fuelConsumption * roadtrip.fuelPricePerL;
    }

    // ── 6. Totaux finaux ───────────────────────────────────────────────
    const grandTotal = accomTotal + activityTotal + expensesTotal;
    const totalPaid = accomDeposits + activityDeposits + expensesPaid;
    const balance = grandTotal - totalPaid;

    res.json({
      summary: {
        grandTotal,
        totalPaid,
        balance,
        balancePercent: grandTotal > 0 ? Math.round((totalPaid / grandTotal) * 100) : 0,
        budgetTarget: roadtrip.budgetTarget,
        budgetCurrency: roadtrip.budgetCurrency,
        budgetUsedPercent: roadtrip.budgetTarget && grandTotal > 0
          ? Math.min(100, Math.round((grandTotal / roadtrip.budgetTarget) * 100))
          : null,
        remainingBudget: roadtrip.budgetTarget
          ? Math.max(0, roadtrip.budgetTarget - grandTotal)
          : null,
      },
      breakdown: {
        accommodation: { total: accomTotal, deposits: accomDeposits, count: accomCount },
        activities: { total: activityTotal, deposits: activityDeposits, count: activityCount },
        expenses: {
          total: expensesTotal,
          paid: expensesPaid,
          byCategory: expensesByCategory,
        },
        fuel: {
          estimated: estimatedFuelCost ? Math.round(estimatedFuelCost * 100) / 100 : null,
          totalKm: Math.round(totalKm * 10) / 10,
          consumption: roadtrip.fuelConsumption,
          fuelType: roadtrip.fuelType,
          fuelPricePerL: roadtrip.fuelPricePerL,
        },
      },
      byStep: budgetByStep,
      settings: {
        budgetTarget: roadtrip.budgetTarget,
        budgetCurrency: roadtrip.budgetCurrency,
        fuelConsumption: roadtrip.fuelConsumption,
        fuelType: roadtrip.fuelType,
        fuelPricePerL: roadtrip.fuelPricePerL,
      },
    });
  } catch (e) { next(e); }
});

// ─── GET /api/roadtrips/:id/budget/daily ─────────────────────────────────────

router.get('/:id/budget/daily', async (req, res, next) => {
  try {
    const roadtrip = await prisma.roadtrip.findUnique({
      where: { id: req.params.id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            accommodations: true,
            activities: true,
          },
        },
        expenses: true,
      },
    });

    if (!roadtrip) return res.status(404).json({ error: 'Roadtrip not found' });
    if (!roadtrip.startDate) return res.json({ daily: [] });

    const startDate = new Date(roadtrip.startDate);
    const endDate = roadtrip.endDate ? new Date(roadtrip.endDate) : new Date(startDate);
    const nbDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);

    const daily = [];

    for (let i = 0; i < nbDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().slice(0, 10);

      // Trouver l'étape correspondant à ce jour
      const stepForDay = roadtrip.steps.find(s => {
        if (!s.startDate) return false;
        const sStart = s.startDate.toISOString().slice(0, 10);
        const sEnd = s.endDate ? s.endDate.toISOString().slice(0, 10) : sStart;
        return dateStr >= sStart && dateStr <= sEnd;
      });

      // Coûts des hébergements (répartis sur les nuits)
      const accomForDay = roadtrip.steps.flatMap(s => s.accommodations).filter(a => {
        if (!a.checkIn) return false;
        const cIn = a.checkIn.toISOString().slice(0, 10);
        const cOut = a.checkOut ? a.checkOut.toISOString().slice(0, 10) : cIn;
        return dateStr >= cIn && dateStr < cOut;
      });
      const accomDayCost = sum(accomForDay, a => {
        const nights = calcNights(a.checkIn, a.checkOut) || 1;
        const total = a.totalPrice || (a.pricePerNight ? a.pricePerNight * nights : 0);
        return total / nights;
      });

      // Activités du jour
      const actForDay = stepForDay
        ? roadtrip.steps.find(s => s.id === stepForDay.id)?.activities.filter(a => {
            if (!a.startTime) return false;
            return a.startTime.toISOString().slice(0, 10) === dateStr;
          }) || []
        : [];
      const actDayCost = sum(actForDay, a => a.cost || 0);

      // Dépenses custom du jour
      const expForDay = roadtrip.expenses.filter(e => {
        if (!e.date) return false;
        return e.date.toISOString().slice(0, 10) === dateStr;
      });
      const expDayCost = sum(expForDay, e => e.amount || 0);

      daily.push({
        date: dateStr,
        day: i + 1,
        stepName: stepForDay?.name || null,
        accommodation: Math.round(accomDayCost * 100) / 100,
        activities: Math.round(actDayCost * 100) / 100,
        expenses: Math.round(expDayCost * 100) / 100,
        total: Math.round((accomDayCost + actDayCost + expDayCost) * 100) / 100,
      });
    }

    res.json({ daily });
  } catch (e) { next(e); }
});

// ─── POST /api/roadtrips/:id/expenses ────────────────────────────────────────

router.post('/:id/expenses', async (req, res, next) => {
  try {
    const { category, label, amount, currency, paid, stepId, date, notes } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label requis' });

    const expense = await prisma.expense.create({
      data: {
        roadtripId: req.params.id,
        category: category || 'OTHER',
        label: label.trim(),
        amount: amount ?? 0,
        currency: currency || 'EUR',
        paid: paid ?? false,
        paidById: req.user.userId,
        stepId: stepId || null,
        date: date ? new Date(date) : null,
        notes: notes || null,
      },
    });

    res.status(201).json(expense);
  } catch (e) { next(e); }
});

// ─── PATCH /api/roadtrips/:id/expenses/:expenseId ────────────────────────────

router.patch('/:id/expenses/:expenseId', async (req, res, next) => {
  try {
    const { category, label, amount, currency, paid, stepId, date, notes } = req.body;
    const patch = {};
    if (category !== undefined) patch.category = category;
    if (label !== undefined) patch.label = label;
    if (amount !== undefined) patch.amount = amount;
    if (currency !== undefined) patch.currency = currency;
    if (paid !== undefined) patch.paid = paid;
    if (stepId !== undefined) patch.stepId = stepId;
    if (date !== undefined) patch.date = date ? new Date(date) : null;
    if (notes !== undefined) patch.notes = notes;

    const expense = await prisma.expense.update({
      where: { id: req.params.expenseId },
      data: patch,
    });

    res.json(expense);
  } catch (e) { next(e); }
});

// ─── DELETE /api/roadtrips/:id/expenses/:expenseId ───────────────────────────

router.delete('/:id/expenses/:expenseId', async (req, res, next) => {
  try {
    await prisma.expense.delete({ where: { id: req.params.expenseId } });
    res.status(204).end();
  } catch (e) { next(e); }
});

// ─── PATCH /api/roadtrips/:id/budget-settings ────────────────────────────────

router.patch('/:id/budget-settings', async (req, res, next) => {
  try {
    const { budgetTarget, budgetCurrency, fuelConsumption, fuelType, fuelPricePerL } = req.body;
    const patch = {};
    if (budgetTarget !== undefined) patch.budgetTarget = budgetTarget;
    if (budgetCurrency !== undefined) patch.budgetCurrency = budgetCurrency;
    if (fuelConsumption !== undefined) patch.fuelConsumption = fuelConsumption;
    if (fuelType !== undefined) patch.fuelType = fuelType;
    if (fuelPricePerL !== undefined) patch.fuelPricePerL = fuelPricePerL;

    const roadtrip = await prisma.roadtrip.update({
      where: { id: req.params.id },
      data: patch,
      select: {
        id: true,
        budgetTarget: true,
        budgetCurrency: true,
        fuelConsumption: true,
        fuelType: true,
        fuelPricePerL: true,
      },
    });

    res.json(roadtrip);
  } catch (e) { next(e); }
});

module.exports = router;
