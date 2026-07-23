// ─── Contrôle de cohérence LOCAL (PowerSync SQLite, toujours à jour) ──────
// Remplace l'appel API backend qui lisait des données PostgreSQL obsolètes.
// Portage complet du backend timeCoherenceChecker.js

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseHour(val) {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const m = String(val).match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  const m2 = String(val).match(/^(\d{1,2})/);
  return m2 ? parseInt(m2[1]) : null;
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`;
}

function fmtHour(date) {
  if (!date) return '--:--';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function combineDateAndTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number);
    if (!isNaN(h)) dt.setHours(h, min || 0, 0, 0);
  }
  return dt;
}

function extractTime(str) {
  if (!str) return null;
  if (str.includes('T')) return str.split('T')[1]?.slice(0, 5) || null;
  if (str.includes(' ')) return str.split(' ')[1]?.slice(0, 5) || null;
  return /^\d{2}:\d{2}/.test(str) ? str.slice(0, 5) : null;
}

const RECEPTION_LIMITS = { CAMPING: 20, HOTEL: 24, PARKING: 22, OTHER: 22 };

// ── Construction de la timeline d'une étape ─────────────────────────────────
function buildTimeline(step, accommodations, activities) {
  const items = [];
  const arrivalDate = combineDateAndTime(step.startDate, extractTime(step.arrivalTime));
  if (arrivalDate) items.push({ id: `arrival-${step.id}`, type: 'ARRIVAL', name: '🛬 Arrivée', start: arrivalDate, end: arrivalDate, order: -2 });
  for (const acc of accommodations || []) {
    const ci = combineDateAndTime(step.startDate, extractTime(acc.checkIn));
    const co = combineDateAndTime(step.endDate, extractTime(acc.checkOut));
    if (ci && co) items.push({
      id: `acc-${acc.id}`, type: 'ACCOMMODATION',
      name: `${acc.type === 'CAMPING' ? '🏕️' : acc.type === 'HOTEL' ? '🏨' : '🏠'} ${acc.name}`,
      subtype: acc.type, start: ci, end: co, order: -1,
    });
  }
  for (const act of activities || []) {
    const s = combineDateAndTime(step.startDate, extractTime(act.startTime));
    const e = combineDateAndTime(step.startDate, extractTime(act.endTime));
    if (s && e) items.push({
      id: `act-${act.id}`, type: 'ACTIVITY',
      name: `${act.type === 'HIKING' ? '🥾' : act.type === 'RESTAURANT' ? '🍽️' : '🎯'} ${act.name}`,
      subtype: act.type, start: s, end: e, order: act.order || 0,
    });
  }
  const depDate = combineDateAndTime(step.endDate, extractTime(step.departureTime));
  if (depDate) items.push({ id: `departure-${step.id}`, type: 'DEPARTURE', name: '🛫 Départ', start: depDate, end: depDate, order: 999 });
  items.sort((a, b) => a.start - b.start || a.order - b.order);
  return items;
}

// ── Chevauchements ──────────────────────────────────────────────────────────
function detectOverlaps(steps, accMap, actMap) {
  const issues = [];
  for (const step of steps) {
    const tl = buildTimeline(step, accMap.get(step.id) || [], actMap.get(step.id) || []);
    if (tl.length < 2) continue;
    for (let i = 0; i < tl.length; i++) {
      for (let j = i + 1; j < tl.length; j++) {
        const a = tl[i], b = tl[j];
        if (b.start >= a.end) break;
        if (a.type === 'ACCOMMODATION' && b.type === 'ACTIVITY' || a.type === 'ACTIVITY' && b.type === 'ACCOMMODATION') continue;
        if (a.type === 'ARRIVAL' || b.type === 'ARRIVAL' || a.type === 'DEPARTURE' || b.type === 'DEPARTURE') continue;
        if (a.start < b.end && b.start < a.end) {
          const om = Math.round((Math.min(a.end, b.end) - Math.max(a.start, b.start)) / 60000);
          issues.push({
            id: `overlap-${step.id}-${i}-${j}`, type: 'OVERLAP',
            severity: a.type === 'ACTIVITY' && b.type === 'ACTIVITY' ? 'HIGH' : om > 30 ? 'HIGH' : 'MEDIUM',
            stepId: step.id, stepName: step.name,
            summary: `⚡ Chevauchement : ${a.name} × ${b.name}`,
            description: `${a.name} (${fmtHour(a.start)}-${fmtHour(a.end)}) chevauche ${b.name} (${fmtHour(b.start)}-${fmtHour(b.end)}) — ${om} min`,
            overlapMinutes: om,
          });
        }
      }
    }
  }
  return issues;
}

// ── Trous dans le planning ──────────────────────────────────────────────────
function detectGaps(steps, accMap, actMap) {
  const issues = [];
  for (const step of steps) {
    const tl = buildTimeline(step, accMap.get(step.id) || [], actMap.get(step.id) || []);
    if (tl.length < 2) continue;
    for (let i = 1; i < tl.length; i++) {
      const p = tl[i - 1], c = tl[i];
      const gapMs = c.start - p.end;
      if (gapMs <= 0) continue;
      const gh = Math.round(gapMs / 3600000 * 10) / 10;
      let th = null, gt = null;
      if (p.type === 'ARRIVAL' && c.type !== 'DEPARTURE') { th = 3; gt = 'GAP_AFTER_ARRIVAL'; }
      else if (c.type === 'DEPARTURE' && p.type !== 'ARRIVAL') { th = 4; gt = 'GAP_BEFORE_DEPARTURE'; }
      else if (p.type !== 'ARRIVAL' && c.type !== 'DEPARTURE') { th = 3; gt = 'GAP_BETWEEN_ITEMS'; }
      if (th !== null && gh > th) {
        issues.push({
          id: `gap-${step.id}-${i}`, type: 'GAP', severity: 'LOW',
          stepId: step.id, stepName: step.name, gapType: gt,
          summary: `🕳️ Trou de ${gh}h — ${step.name}`,
          description: `Entre ${p.name} (${fmtHour(p.end)}) et ${c.name} (${fmtHour(c.start)}) — ${gh}h`,
          gapHours: gh,
        });
      }
    }
  }
  return issues;
}

// ── Jours vides ─────────────────────────────────────────────────────────────
function detectEmptyDays(steps, actMap) {
  const issues = [];
  const lastO = Math.max(...steps.map(s => s.order), -1);
  for (const step of steps) {
    if (step.order === lastO || !step.startDate || !step.endDate) continue;
    const s = combineDateAndTime(step.startDate), e = combineDateAndTime(step.endDate);
    if (!s || !e) continue;
    const n = Math.round((e - s) / 86400000);
    if (n < 1) continue;
    if ((actMap.get(step.id) || []).length === 0) {
      issues.push({
        id: `empty-${step.id}`, type: 'GAP', severity: 'LOW',
        stepId: step.id, stepName: step.name,
        summary: `📭 Séjour sans activité — ${step.name}`,
        description: `${n} nuit${n > 1 ? 's' : ''} à ${step.name} mais aucune activité programmée`,
        nights: n,
      });
    }
  }
  return issues;
}

// ── Arrivée tardive ─────────────────────────────────────────────────────────
function detectLateArrivals(steps) {
  const issues = [];
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i], p = steps[i - 1];
    if (!s.routeDurationSeconds) continue;
    const dep = combineDateAndTime(p.endDate || p.startDate, p.departureTime || '10:00');
    if (!dep) continue;
    const arr = new Date(dep.getTime() + s.routeDurationSeconds * 1000);
    const ah = arr.getHours() + arr.getMinutes() / 60;
    if (ah > 21) {
      issues.push({
        id: `late-${s.id}`, type: 'TIGHT', severity: 'HIGH',
        stepId: s.id, stepName: s.name,
        summary: `⚠️ Arrivée tardive à ${s.name} (≈${Math.round(ah)}h)`,
        description: `Départ ${p.name} à ${p.departureTime || '10:00'} · ${Math.round(s.routeDurationSeconds / 60)} min
→ arrivée vers ${fmtHour(arr)}`,
        estimatedArrivalHour: Math.round(ah * 10) / 10,
        routeMinutes: Math.round(s.routeDurationSeconds / 60),
      });
    }
  }
  return issues;
}

// ── Check-in après fermeture ────────────────────────────────────────────────
function detectLateCheckins(steps, accMap) {
  const issues = [];
  for (const step of steps) {
    for (const acc of accMap.get(step.id) || []) {
      const lh = RECEPTION_LIMITS[acc.type];
      if (!lh || lh >= 24) continue;
      const [h] = (step.arrivalTime || '20:00').split(':').map(Number);
      if (isNaN(h) || h <= lh) continue;
      issues.push({
        id: `checkin-${acc.id}`, type: 'TIGHT', severity: 'HIGH',
        stepId: step.id, stepName: step.name,
        summary: `🔑 Arrivée après fermeture — ${acc.name}`,
        description: `Arrivée prévue à ${step.arrivalTime || '20:00'} mais la réception d'un ${(acc.type || 'hôtel').toLowerCase()} ferme à ${lh}h`,
        arrivalHour: h, receptionLimit: lh,
      });
    }
  }
  return issues;
}

// ── Arrivée à 00:00 (non renseignée) ──────────────────────────────────────
function detectMidnightArrivals(steps, accMap) {
  const issues = [];
  for (let i = 1; i < steps.length; i++) {
    const n = steps[i];
    if (!n.arrivalTime || n.arrivalTime === '00:00') {
      const accs = accMap.get(n.id) || [];
      const culprit = accs.length > 0 ? accs[0] : null;
      // Récupérer l'étape précédente pour le contexte
      const prev = steps[i - 1];
      const prevDepTime = prev?.departureTime || '--:--';
      const routeMin = prev?.routeDurationSeconds ? Math.round(prev.routeDurationSeconds / 60) : null;
      const routeStr = routeMin ? ` · ${fmtDuration(routeMin)} de route` : '';
      if (culprit) {
        issues.push({
          id: `midnight-${n.id}`, type: 'GAP', severity: 'LOW',
          stepId: n.id, stepName: n.name,
          summary: `🕛 Arrivée à minuit — ${n.name}`,
          description: `Départ ${prev?.name || 'étape précédente'} à ${prevDepTime}${routeStr}
↳ arrivée à 00:00 (non renseignée)
→ Modifie le checkIn du ${(culprit.type || 'hébergement').toLowerCase()} pour corriger`,
          culpritId: culprit.id, culpritType: 'accommodation',
          departureTime: prevDepTime,
          routeMinutes: routeMin || 0,
        });
      } else {
        issues.push({
          id: `midnight-${n.id}`, type: 'GAP', severity: 'LOW',
          stepId: n.id, stepName: n.name,
          summary: `🕛 Arrivée à minuit — ${n.name}`,
          description: `Départ ${prev?.name || 'étape précédente'} à ${prevDepTime}${routeStr}
↳ arrivée à 00:00 (non renseignée)
→ Modifie l'heure d'arrivée dans les paramètres de l'étape`,
          departureTime: prevDepTime,
          routeMinutes: routeMin || 0,
        });
      }
    }
  }
  return issues;
}

// ── Trajet trop serré ───────────────────────────────────────────────────────
function detectTravelMismatch(steps) {
  const issues = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const p = steps[i], n = steps[i + 1];
    if (!p.routeDurationSeconds) continue;
    const rm = Math.round(p.routeDurationSeconds / 60);
    const rh = rm / 60;
    const dh = parseHour(p.departureTime) ?? 10;
    let ah = parseHour(n.arrivalTime) ?? 20;
    // Prendre en compte la date : si l'arrivée est un jour différent du départ,
    // 00:00 = minuit le lendemain → 24h
    const depDate = p.endDate || p.startDate;
    const arrDate = n.startDate;
    if (depDate && arrDate && arrDate !== depDate) {
      if (ah === 0) ah = 24;
    }
    const av = ah - dh;
    if (av > 0 && rh > av) {
      issues.push({
        id: `tight-${p.id}-${n.id}`, type: 'TIGHT', severity: 'HIGH',
        stepId: n.id, stepName: n.name, prevStepId: p.id,
        summary: `⏱️ Trajet trop serré — ${p.name} → ${n.name}`,
        description: `Départ ${p.name} à ${p.departureTime || '10:00'}
Temps de trajet : ${fmtDuration(rm)}
Arrivée à ${n.arrivalTime || '--:--'}`,
        routeMinutes: rm, availableHours: av,
        departureTime: p.departureTime || '10:00',
        arrivalTime: n.arrivalTime || '--:--',
      });
    } else if (rh > 6) {
      issues.push({
        id: `long-${p.id}-${n.id}`, type: 'TIGHT', severity: 'MEDIUM',
        stepId: n.id, stepName: n.name,
        summary: `🚗 Long trajet — ${p.name} → ${n.name}`,
        description: `${fmtDuration(rm)} de route — journée chargée`,
        routeMinutes: rm, routeHours: rh,
      });
    }
  }
  return issues;
}

// ── Point d'entrée principal ────────────────────────────────────────────────
export async function localCheckCoherence(roadtripId, db) {
  try {
    const [steps, allAccs, allActs] = await Promise.all([
      db.getAll('SELECT * FROM steps WHERE roadtripId = ? ORDER BY "order" ASC', [roadtripId]),
      db.getAll('SELECT * FROM accommodations WHERE roadtripId = ?', [roadtripId]),
      db.getAll('SELECT * FROM activities WHERE roadtripId = ?', [roadtripId]),
    ]);
    if (!steps || steps.length < 2) return [];
    const accMap = new Map(), actMap = new Map();
    for (const a of allAccs || []) { const l = accMap.get(a.stepId) || []; l.push(a); accMap.set(a.stepId, l); }
    for (const a of allActs || []) { const l = actMap.get(a.stepId) || []; l.push(a); actMap.set(a.stepId, l); }
    return [
      ...detectOverlaps(steps, accMap, actMap),
      ...detectMidnightArrivals(steps, accMap),
      ...detectGaps(steps, accMap, actMap),
      ...detectEmptyDays(steps, actMap),
      ...detectLateArrivals(steps),
      ...detectLateCheckins(steps, accMap),
      ...detectTravelMismatch(steps),
    ];
  } catch (e) {
    console.warn('[localCheckCoherence] ⚠️', e.message);
    return [];
  }
}
