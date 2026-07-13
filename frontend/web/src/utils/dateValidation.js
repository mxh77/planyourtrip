/**
 * Validation des cohérences de dates — partagé web + mobile.
 * Toutes les fonctions acceptent des strings ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm).
 * Retournent un tableau de messages d'erreur, vide si tout est valide.
 */

function d(str) {
  return str ? str.slice(0, 10) : null;
}

/**
 * Validation des dates d'une étape.
 * @param {object} p
 * @param {string} [p.startDate]     YYYY-MM-DD
 * @param {string} [p.endDate]       YYYY-MM-DD
 * @param {string} [p.roadtripStart] YYYY-MM-DD
 * @param {string} [p.roadtripEnd]   YYYY-MM-DD
 * @returns {string[]}
 */
export function validateStepDates({ startDate, endDate, roadtripStart, roadtripEnd } = {}) {
  const errors = [];
  const s = d(startDate), e = d(endDate), rs = d(roadtripStart), re = d(roadtripEnd);

  if (s && e && s > e)
    errors.push("La date de fin doit être égale ou postérieure à la date d'arrivée.");
  if (rs && s && s < rs)
    errors.push(`La date d'arrivée (${s}) est avant le début du roadtrip (${rs}).`);
  if (re && s && s > re)
    errors.push(`La date d'arrivée (${s}) est après la fin du roadtrip (${re}).`);
  if (rs && e && e < rs)
    errors.push(`La date de départ (${e}) est avant le début du roadtrip (${rs}).`);
  if (re && e && e > re)
    errors.push(`La date de départ (${e}) est après la fin du roadtrip (${re}).`);

  return errors;
}

/**
 * Validation des dates d'un hébergement.
 * @param {object} p
 * @param {string} [p.checkIn]    YYYY-MM-DD ou YYYY-MM-DDTHH:mm
 * @param {string} [p.checkOut]   idem
 * @param {string} [p.stepStart]  YYYY-MM-DD
 * @param {string} [p.stepEnd]    YYYY-MM-DD
 * @returns {string[]}
 */
export function validateAccommodationDates({ checkIn, checkOut, stepStart, stepEnd } = {}) {
  const errors = [];
  const ci = d(checkIn), co = d(checkOut), ss = d(stepStart), se = d(stepEnd);

  if (ci && co && ci > co)
    errors.push('La date de check-out doit être égale ou postérieure au check-in.');
  if (ss && ci && ci < ss)
    errors.push(`Le check-in (${ci}) est avant le début de l'étape (${ss}).`);
  if (se && co && co > se)
    errors.push(`Le check-out (${co}) dépasse la fin de l'étape (${se}).`);

  return errors;
}

/**
 * Validation des dates/heures d'une activité.
 * @param {object} p
 * @param {string} [p.startTime]  YYYY-MM-DD ou YYYY-MM-DDTHH:mm
 * @param {string} [p.endTime]    idem
 * @param {string} [p.stepStart]  YYYY-MM-DD
 * @param {string} [p.stepEnd]    YYYY-MM-DD
 * @returns {string[]}
 */
export function validateActivityDates({ startTime, endTime, stepStart, stepEnd } = {}) {
  const errors = [];
  const st = d(startTime), et = d(endTime), ss = d(stepStart), se = d(stepEnd);

  if (st && et && st > et)
    errors.push("L'heure de fin doit être égale ou postérieure à l'heure de début.");
  if (ss && st && st < ss)
    errors.push(`La date de l'activité (${st}) est avant le début de l'étape (${ss}).`);
  if (se && st && st > se)
    errors.push(`La date de l'activité (${st}) est après la fin de l'étape (${se}).`);
  if (se && et && et > se)
    errors.push(`La fin de l'activité (${et}) dépasse la fin de l'étape (${se}).`);

  return errors;
}
