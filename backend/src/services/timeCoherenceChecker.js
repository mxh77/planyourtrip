/**
 * timeCoherenceChecker.js — Vérificateur de cohérence temporelle
 *
 * Détecte :
 *  - Règle #1 : Chevauchements d'activités (deux activités à la même heure)
 *  - Règle #3 : Double hébergement sur la même période
 *  - Règles #4-6 : Trous dans le planning d'une étape
 *  - Règle #7 : Journées sans activité
 *  - Règle #8 : Arrivées tardives (liaison trop serrée entre étapes)
 *  - Règle #10 : Check-in après fermeture de réception
 *
 * NB : Les chevauchements activité×hébergement ne sont PAS considérés comme
 * des anomalies car l'hébergement englobe toute la durée du séjour.
 *
 * Toutes les dates sont manipulées en heure locale (pas d'UTC).
 * Voir .github/copilot-instructions.md — RÈGLE CRITIQUE — Gestion des dates
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Helpers date (LOCAL TIME ONLY) ──────────────────────────────────────────

function parseDateOnly(val) {
  if (!val) return null;
  // Gérer à la fois les Date objects (Prisma) et les strings YYYY-MM-DD
  if (val instanceof Date) {
    return new Date(val.getFullYear(), val.getMonth(), val.getDate(), 12, 0, 0);
  }
  if (typeof val === 'string' || typeof val === 'number') {
    val = String(val);
    const [y, m, d] = val.slice(0, 10).split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d, 12, 0, 0); // midi local = jamais de décalage jour
  }
  return null;
}

function combineDateAndTime(dateVal, timeStr) {
  if (!dateVal) return null;
  const d = parseDateOnly(dateVal);
  if (!d) return null;
  if (!timeStr) return d;
  const [h, min] = timeStr.split(':').map(Number);
  if (isNaN(h)) return d;
  d.setHours(h, min || 0, 0, 0);
  return d;
}

function formatHour(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Calcul d'écart en heures éveillées ──────────────────────────────────────
// Soustrait les périodes de sommeil (ex: 23h→7h) pour ne compter que le temps
// d'éveil entre deux moments. Évite les faux positifs type "trou de 15h" alors
// qu'on dort entre les deux.

function computeAwakeGapHours(prevEnd, currStart, sleepStart = 23, sleepEnd = 7) {
  const gapMs = currStart - prevEnd;
  if (gapMs <= 0) return 0;

  // Durée d'une nuit de sommeil en ms
  const sleepHours = sleepStart > sleepEnd
    ? (24 - sleepStart + sleepEnd)
    : (sleepEnd - sleepStart);
  const sleepMs = sleepHours * 3600000;

  // Compter les nuits complètes entre les deux dates
  const startOfDay = (d) => {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  };

  const prevDay = startOfDay(prevEnd);
  const currDay = startOfDay(currStart);
  const diffDays = Math.round((currDay - prevDay) / 86400000);

  // Si même jour → pas de nuit à soustraire
  if (diffDays <= 0) return Math.round(gapMs / 3600000 * 10) / 10;

  // Si jours différents → soustraire les nuits complètes
  const awakeMs = gapMs - diffDays * sleepMs;
  return Math.round(Math.max(0, awakeMs) / 3600000 * 10) / 10;
}

// ── Construction de la timeline d'une étape ─────────────────────────────────
// Retourne une liste ordonnée d'items { id, type, name, start, end, order, ... }

function buildTimeline(step) {
  const items = [];

  // Arrivée
  const arrivalDate = combineDateAndTime(step.startDate, step.arrivalTime);
  if (arrivalDate) {
    items.push({
      id: `arrival-${step.id}`,
      type: 'ARRIVAL',
      name: '🛬 Arrivée',
      start: arrivalDate,
      end: arrivalDate,
      order: -2,
    });
  }

  // Hébergements
  for (const acc of step.accommodations || []) {
    const checkIn = acc.checkIn ? new Date(acc.checkIn) : null;
    const checkOut = acc.checkOut ? new Date(acc.checkOut) : null;
    if (checkIn && checkOut) {
      items.push({
        id: `acc-${acc.id}`,
        type: 'ACCOMMODATION',
        name: `${acc.type === 'CAMPING' ? '🏕️' : acc.type === 'HOTEL' ? '🏨' : '🏠'} ${acc.name}`,
        subtype: acc.type,
        start: checkIn,
        end: checkOut,
        order: -1,
        data: acc,
      });
    }
  }

  // Activités
  for (const act of step.activities || []) {
    const start = act.startTime ? new Date(act.startTime) : null;
    const end = act.endTime ? new Date(act.endTime) : null;
    if (start && end) {
      items.push({
        id: `act-${act.id}`,
        type: 'ACTIVITY',
        name: `${act.type === 'HIKING' ? '🥾' : act.type === 'RESTAURANT' ? '🍽️' : '🎯'} ${act.name}`,
        subtype: act.type,
        start,
        end,
        order: act.order || 0,
        data: act,
      });
    }
  }

  // Départ
  const departureDate = combineDateAndTime(step.endDate, step.departureTime);
  if (departureDate) {
    items.push({
      id: `departure-${step.id}`,
      type: 'DEPARTURE',
      name: '🛫 Départ',
      start: departureDate,
      end: departureDate,
      order: 999,
    });
  }

  items.sort((a, b) => a.start - b.start || a.order - b.order);
  return items;
}

// ── Règle #1 : Chevauchement d'activités ────────────────────────────────────
// ── Règle #3 : Double hébergement ───────────────────────────────────────────
// NB : Les chevauchements activité×hébergement ne sont PAS détectés car
// l'hébergement englobe naturellement la durée du séjour (check-in → check-out).
// Les activités se déroulent PENDANT le séjour, c'est normal.

function detectOverlaps(steps) {
  const issues = [];

  for (const step of steps) {
    const timeline = buildTimeline(step);
    if (timeline.length < 2) continue;

    for (let i = 0; i < timeline.length; i++) {
      for (let j = i + 1; j < timeline.length; j++) {
        const a = timeline[i];
        const b = timeline[j];

        // Optimisation : si b commence après la fin de a, les suivants aussi
        if (b.start >= a.end) break;

        // Exclure les paires ACTIVITY×ACCOMMODATION :
        // l'hébergement englobe tout le séjour, les activités sont dedans → normal
        const types = [a.type, b.type];
        if (types.includes('ACCOMMODATION') && types.includes('ACTIVITY')) continue;
        // Exclure les paires avec ARRIVAL/DEPARTURE (instantanés, pas des durées)
        if (types.includes('ARRIVAL') || types.includes('DEPARTURE')) continue;

        // Vérifier chevauchement : a commence avant la fin de b ET b commence avant la fin de a
        if (a.start < b.end && b.start < a.end) {
          const overlapMin = Math.round((Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000);

          // Sévérité
          let severity = 'MEDIUM';
          if (a.type === 'ACTIVITY' && b.type === 'ACTIVITY') severity = 'HIGH';
          else if (overlapMin > 30) severity = 'HIGH';

          issues.push({
            id: `overlap-${step.id}-${i}-${j}`,
            type: 'OVERLAP',
            severity,
            stepId: step.id,
            stepName: step.name,
            stepOrder: step.order,
            summary: `⚡ Chevauchement : ${a.name} × ${b.name}`,
            description: `${a.name} (${formatHour(a.start)}-${formatHour(a.end)}) chevauche ${b.name} (${formatHour(b.start)}-${formatHour(b.end)}) — ${overlapMin} min de recouvrement`,
            overlapMinutes: overlapMin,
            items: [
              { type: a.type, name: a.name, itemId: a.data?.id || step.id, subtype: a.subtype, start: a.start.toISOString(), end: a.end.toISOString() },
              { type: b.type, name: b.name, itemId: b.data?.id || step.id, subtype: b.subtype, start: b.start.toISOString(), end: b.end.toISOString() },
            ],
          });
        }
      }
    }
  }

  return issues;
}

// ── Règle #4 : Trou arrivée → 1ère activité ─────────────────────────────────
// ── Règle #5 : Trou dernière activité → départ ──────────────────────────────
// ── Règle #6 : Trou entre activités ─────────────────────────────────────────

function detectGaps(steps, thresholds = {}) {
  const issues = [];
  const gapAfterArrival       = (thresholds.gapAfterArrival || 3) * 3600000;
  const gapBeforeDeparture    = (thresholds.gapBeforeDeparture || 4) * 3600000;
  const gapBetweenActivities  = (thresholds.gapBetweenActivities || 3) * 3600000;
  const sleepStart            = thresholds.sleepStart ?? 23;
  const sleepEnd              = thresholds.sleepEnd ?? 7;

  for (const step of steps) {
    const timeline = buildTimeline(step);
    if (timeline.length < 2) continue;

    for (let i = 1; i < timeline.length; i++) {
      const prev = timeline[i - 1];
      const curr = timeline[i];
      const gapMs = curr.start - prev.end;
      const gapHours = Math.round(gapMs / 3600000 * 10) / 10;
      const awakeHours = computeAwakeGapHours(prev.end, curr.start, sleepStart, sleepEnd);

      if (gapMs <= 0) continue;

      let threshold = null;
      let gapType = null;

      if (prev.type === 'ARRIVAL' && curr.type !== 'DEPARTURE') {
        threshold = gapAfterArrival;
        gapType = 'GAP_AFTER_ARRIVAL';
      } else if (curr.type === 'DEPARTURE' && prev.type !== 'ARRIVAL') {
        threshold = gapBeforeDeparture;
        gapType = 'GAP_BEFORE_DEPARTURE';
      } else if (prev.type !== 'ARRIVAL' && curr.type !== 'DEPARTURE') {
        threshold = gapBetweenActivities;
        gapType = 'GAP_BETWEEN_ITEMS';
      }

      // Comparer le seuil avec le temps d'éveil (pas le gap brut)
      // pour ignorer les périodes de sommeil
      const effectiveGapMs = awakeHours * 3600000;

      if (threshold !== null && effectiveGapMs > threshold) {
        issues.push({
          id: `gap-${step.id}-${i}`,
          type: 'GAP',
          severity: 'LOW',
          stepId: step.id,
          stepName: step.name,
          stepOrder: step.order,
          gapType,
          summary: `🕳️ Trou de ${awakeHours}h (éveillé) — ${step.name}`,
          description: `Entre ${prev.name} (${formatHour(prev.end)}) et ${curr.name} (${formatHour(curr.start)}) — ${gapHours}h au total, ${awakeHours}h d'éveil`,
          gapHours: awakeHours,
          rawGapHours: gapHours,
          sleepHours: gapHours - awakeHours,
          between: {
            from: { type: prev.type, name: prev.name, itemId: prev.data?.id || step.id, end: prev.end.toISOString() },
            to: { type: curr.type, name: curr.name, itemId: curr.data?.id || step.id, start: curr.start.toISOString() },
          },
        });
      }
    }
  }

  return issues;
}

// ── Règle #7 : Journée entière sans activité ────────────────────────────────

function detectEmptyDays(steps) {
  const issues = [];
  const lastOrder = Math.max(...steps.map(s => s.order), -1);

  for (const step of steps) {
    // Dernière étape = retour, pas d'alerte
    if (step.order === lastOrder) continue;
    if (!step.startDate || !step.endDate) continue;

    const start = parseDateOnly(step.startDate);
    const end = parseDateOnly(step.endDate);
    if (!start || !end) continue;

    const nights = Math.round((end - start) / 86400000);
    if (nights < 1) continue;

    const hasActivities = (step.activities?.length || 0) > 0;
    if (!hasActivities) {
      issues.push({
        id: `empty-${step.id}`,
        type: 'GAP',
        severity: 'LOW',
        stepId: step.id,
        stepName: step.name,
        stepOrder: step.order,
        gapType: 'EMPTY_DAY',
        summary: `📭 Séjour sans activité — ${step.name}`,
        description: `${nights} nuit${nights > 1 ? 's' : ''} à ${step.name} mais aucune activité programmée`,
        nights,
      });
    }
  }

  return issues;
}

// ── Règle #8 : Arrivée tardive après une longue route ───────────────────────

function detectLateArrivals(steps, thresholds = {}) {
  const issues = [];
  const maxArrivalHour = thresholds.maxArrivalHour || 21;

  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    const prevStep = steps[i - 1];

    if (!step.routeDurationSeconds && step.routeDurationSeconds !== 0) continue;
    if (!prevStep.startDate || !step.startDate) continue;

    // Heure de départ : departureTime de l'étape précédente, ou 10h par défaut
    const depTime = prevStep.departureTime || '10:00';
    const depDate = combineDateAndTime(prevStep.endDate || prevStep.startDate, depTime);
    if (!depDate) continue;

    const arrivalDate = new Date(depDate.getTime() + step.routeDurationSeconds * 1000);
    const arrivalHour = arrivalDate.getHours() + arrivalDate.getMinutes() / 60;

    if (arrivalHour > maxArrivalHour) {
      issues.push({
        id: `late-${step.id}`,
        type: 'TIGHT',
        severity: 'HIGH',
        stepId: step.id,
        stepName: step.name,
        stepOrder: step.order,
        summary: `⚠️ Arrivée tardive à ${step.name} (≈${Math.round(arrivalHour)}h)`,
        description: `Départ de ${prevStep.name} à ${depTime} + ${Math.round(step.routeDurationSeconds / 60)} min de route → arrivée estimée vers ${arrivalDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
        estimatedArrival: arrivalDate.toISOString(),
        estimatedArrivalHour: Math.round(arrivalHour * 10) / 10,
        departure: {
          fromStep: prevStep.name,
          time: depTime,
        },
        routeMinutes: Math.round(step.routeDurationSeconds / 60),
      });
    }
  }

  return issues;
}

// ── Règle #10 : Check-in après fermeture (selon type d'hébergement) ─────────

const RECEPTION_LIMITS = {
  CAMPING: 20,   // réception ferme à 20h
  HOTEL: 24,     // 24h/24 → pas d'alerte
  PARKING: 22,   // 22h
  OTHER: 22,
};

function detectLateCheckins(steps) {
  const issues = [];

  for (const step of steps) {
    for (const acc of step.accommodations || []) {
      const limitHour = RECEPTION_LIMITS[acc.type];
      if (!limitHour || limitHour >= 24) continue;

      const arrivalTime = step.arrivalTime || '20:00';
      const [h] = arrivalTime.split(':').map(Number);
      if (isNaN(h)) continue;

      if (h > limitHour) {
        issues.push({
          id: `checkin-${acc.id}`,
          type: 'TIGHT',
          severity: 'HIGH',
          stepId: step.id,
          stepName: step.name,
          stepOrder: step.order,
          accommodationId: acc.id,
          summary: `🔑 Arrivée après fermeture — ${acc.name}`,
          description: `Arrivée prévue vers ${arrivalTime} mais la réception d'un ${acc.type.toLowerCase()} ferme généralement à ${limitHour}h`,
          arrivalHour: h,
          receptionLimit: limitHour,
          accommodationType: acc.type,
        });
      }
    }
  }

  return issues;
}

// ── Règle #11 : Temps de trajet incohérent entre deux étapes ────────────────
// Vérifie que le temps de route est compatible avec les heures de départ/arrivée

function detectTravelMismatch(steps) {
  const issues = [];

  for (let i = 0; i < steps.length - 1; i++) {
    const current = steps[i];
    const next = steps[i + 1];

    if (!current.routeDurationSeconds || current.routeDurationSeconds <= 0) continue;

    const routeMinutes = Math.round(current.routeDurationSeconds / 60);
    const routeHours = routeMinutes / 60;

    // Heure de départ (departureTime de l'étape courante, ou 10h par défaut)
    const depHour = parseHour(current.departureTime) ?? 10;
    // Heure d'arrivée souhaitée (arrivalTime de l'étape suivante, ou 20h par défaut)
    const arrHour = parseHour(next.arrivalTime) ?? 20;

    // Temps disponible pour la route (en tenant compte d'une pause déjeuner)
    const availableHours = arrHour - depHour;
    const maxComfortableHours = 6; // Au-delà, c'est une très longue journée de route

    if (availableHours > 0 && routeHours > availableHours) {
      issues.push({
        id: `travel-mismatch-${current.id}`,
        type: 'TIGHT',
        severity: 'HIGH',
        stepId: next.id,
        stepName: next.name,
        stepOrder: next.order,
        summary: `⏱️ Temps de route insuffisant — ${current.name} → ${next.name}`,
        description: `Trajet de ${routeMinutes} min (${routeHours.toFixed(1)}h) mais seulement ${availableHours}h entre le départ (${depHour}h) et l'arrivée souhaitée (${arrHour}h)`,
        departureStepName: current.name,
        routeMinutes,
        availableHours,
        depHour,
        arrHour,
      });
    } else if (routeHours > maxComfortableHours) {
      issues.push({
        id: `travel-long-${current.id}`,
        type: 'TIGHT',
        severity: 'MEDIUM',
        stepId: next.id,
        stepName: next.name,
        stepOrder: next.order,
        summary: `🚗 Long trajet — ${current.name} → ${next.name}`,
        description: `${routeMinutes} min de route (${routeHours.toFixed(1)}h) — journée de conduite chargée`,
        departureStepName: current.name,
        routeMinutes,
        routeHours,
        maxComfortableHours,
      });
    }
  }

  return issues;
}

function parseHour(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const m = String(val).match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  const m2 = String(val).match(/^(\d{1,2})/);
  return m2 ? parseInt(m2[1]) : null;
}

async function checkTimeCoherence(roadtripId, thresholds = {}) {
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: roadtripId },
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: true,
          activities: { orderBy: { startTime: 'asc' } },
        },
      },
    },
  });

  if (!roadtrip) {
    const err = new Error('Roadtrip not found');
    err.status = 404;
    throw err;
  }

  const steps = roadtrip.steps;

  // Lancer toutes les détections
  const [overlaps, gaps, emptyDays, lateArrivals, lateCheckins, travelMismatches] = await Promise.all([
    Promise.resolve(detectOverlaps(steps)),
    Promise.resolve(detectGaps(steps, thresholds)),
    Promise.resolve(detectEmptyDays(steps)),
    Promise.resolve(detectLateArrivals(steps, thresholds)),
    Promise.resolve(detectLateCheckins(steps)),
    Promise.resolve(detectTravelMismatch(steps)),
  ]);

  const allIssues = [...overlaps, ...gaps, ...emptyDays, ...lateArrivals, ...lateCheckins, ...travelMismatches];

  // Stats
  const stats = {
    totalSteps: steps.length,
    totalActivities: steps.reduce((s, st) => s + (st.activities?.length || 0), 0),
    totalAccommodations: steps.reduce((s, st) => s + (st.accommodations?.length || 0), 0),
    totalIssues: allIssues.length,
    bySeverity: {
      HIGH: allIssues.filter(i => i.severity === 'HIGH').length,
      MEDIUM: allIssues.filter(i => i.severity === 'MEDIUM').length,
      LOW: allIssues.filter(i => i.severity === 'LOW').length,
    },
    byType: {
      OVERLAP: allIssues.filter(i => i.type === 'OVERLAP').length,
      GAP: allIssues.filter(i => i.type === 'GAP').length,
      TIGHT: allIssues.filter(i => i.type === 'TIGHT').length,
    },
  };

  return {
    roadtripId,
    roadtripName: roadtrip.title,
    checkedAt: new Date().toISOString(),
    thresholds: {
      gapAfterArrival: thresholds.gapAfterArrival || 3,
      gapBeforeDeparture: thresholds.gapBeforeDeparture || 4,
      gapBetweenActivities: thresholds.gapBetweenActivities || 3,
      maxArrivalHour: thresholds.maxArrivalHour || 21,
      sleepStart: thresholds.sleepStart ?? 23,
      sleepEnd: thresholds.sleepEnd ?? 7,
    },
    stats,
    issues: allIssues,
  };
}

module.exports = { checkTimeCoherence };
