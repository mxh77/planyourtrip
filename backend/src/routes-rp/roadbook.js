/**
 * routes-rp/roadbook.js — Génération de roadbook PDF
 *
 * GET /api/roadtrips/:roadtripId/roadbook
 *   → Retourne un PDF téléchargeable (roadbook complet)
 *
 * GET /api/roadtrips/:roadtripId/roadbook?preview=1
 *   → Retourne le HTML (pour prévisualisation dans le navigateur)
 */

const express = require('express');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const puppeteer = require('puppeteer');
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Télécharge une image et la redimensionne en base64 data URI
 * pour éviter que Puppeteer n'intègre l'image pleine résolution dans le PDF.
 */
async function resizeToDataUri(url, maxWidth = 500, quality = 50) {
  if (!url || url.startsWith('data:')) return url;
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    const buffer = Buffer.from(resp.data);
    const resized = await sharp(buffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch {
    return url; // fallback : URL originale
  }
}

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getDate()} ${MONTHS_FR[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateRange(start, end) {
  if (!start) return '';
  if (!end) return formatDate(start);
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${MONTHS_FR[s.getMonth()]} ${s.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatTime(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatMoney(amount, currency) {
  if (amount == null) return '';
  const sym = { EUR: '€', USD: '$', GBP: '£', CAD: '$' };
  return `${amount.toFixed(2)} ${sym[currency] || currency}`;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h${m > 0 ? m : ''}`;
}

function formatDistance(meters) {
  if (!meters) return '';
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

// ── Générateur de cartes SVG intégrées (pas de Google Maps) ──────────────────

/**
 * Décode une polyline encodée Google Maps en tableau de {lat, lng}
 */
function decodePolyline(encoded) {
  if (!encoded) return [];
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Ré-encode une liste de points en polyline Google Maps
 */
function encodePolyline(points) {
  let encoded = '', lat = 0, lng = 0;
  for (const p of points) {
    const dlat = Math.round((p.lat - lat) * 1e5);
    const dlng = Math.round((p.lng - lng) * 1e5);
    lat = p.lat; lng = p.lng;
    for (let val of [dlat, dlng]) {
      val = val < 0 ? ~(val << 1) : (val << 1);
      while (val >= 0x20) {
        encoded += String.fromCharCode((0x20 | (val & 0x1f)) + 63);
        val >>= 5;
      }
      encoded += String.fromCharCode(val + 63);
    }
  }
  return encoded;
}

/**
 * Simplifie une polyline en ne gardant qu'1 point sur N
 * pour réduire la taille de l'URL Google Maps Static
 */
function simplifyPolyline(encoded, targetChars) {
  if (!encoded || encoded.length <= targetChars) return encoded;
  const pts = decodePolyline(encoded);
  const step = Math.max(1, Math.ceil(pts.length / (targetChars / 3)));
  const simplified = [];
  for (let i = 0; i < pts.length; i += step) {
    simplified.push(pts[i]);
  }
  // Toujours garder le dernier point
  if (simplified[simplified.length - 1] !== pts[pts.length - 1]) {
    simplified.push(pts[pts.length - 1]);
  }
  return encodePolyline(simplified);
}

/**
 * Trouve le point de départ effectif pour une étape :
 * item avec isDeparture, puis departureLatitude, puis l'étape elle-même
 */
function getEffectiveDeparture(step) {
  if (!step) return null;
  const items = [...(step.accommodations || []), ...(step.activities || [])];
  const depItem = items.find(item => item.isDeparture && item.latitude && item.longitude);
  if (depItem) return { lat: depItem.latitude, lng: depItem.longitude };
  if (step.departureLatitude && step.departureLongitude) return { lat: step.departureLatitude, lng: step.departureLongitude };
  if (step.latitude && step.longitude) return { lat: step.latitude, lng: step.longitude };
  return null;
}

/**
 * Trouve le point d'arrivée effectif pour une étape :
 * item avec isArrival, puis arrivalLatitude, puis l'étape elle-même
 */
function getEffectiveArrival(step) {
  if (!step) return null;
  const items = [...(step.accommodations || []), ...(step.activities || [])];
  const arrItem = items.find(item => item.isArrival && item.latitude && item.longitude);
  if (arrItem) return { lat: arrItem.latitude, lng: arrItem.longitude };
  if (step.arrivalLatitude && step.arrivalLongitude) return { lat: step.arrivalLatitude, lng: step.arrivalLongitude };
  if (step.latitude && step.longitude) return { lat: step.latitude, lng: step.longitude };
  return null;
}

/**
 * Génère l'URL Google Maps Static pour une étape du roadbook.
 *
 * @param {object} step - L'étape courante
 * @param {object|null} prevStep - L'étape précédente
 * @param {boolean} skipPolyline - Si true, n'ajoute pas le tracé (1ère étape)
 */
function buildStepMapUrl(step, prevStep, skipPolyline) {
  if (!step.latitude && !step.longitude) return '';
  const key = process.env.GOOGLE_MAPS_API_KEY || '';

  // ── Départ : item isDeparture de l'étape précédente, ou prevStep lui-même ──
  const dep = getEffectiveDeparture(prevStep);
  const depLat = dep?.lat ?? step.departureLatitude ?? step.latitude ?? null;
  const depLng = dep?.lng ?? step.departureLongitude ?? step.longitude ?? null;

  // ── Arrivée : item isArrival de l'étape courante, ou l'étape elle-même ──
  const arr = getEffectiveArrival(step);
  const arrLat = arr?.lat ?? step.latitude ?? null;
  const arrLng = arr?.lng ?? step.longitude ?? null;

  const markers = [];
  if (!skipPolyline && depLat && depLng) {
    markers.push(`color:green|label:D|${depLat},${depLng}`);
  }
  markers.push(`color:red|label:A|${arrLat},${arrLng}`);

  // ── Polyline (uniquement si skipPolyline est false) ──
  let pathParam = '';
  if (!skipPolyline) {
    const sourcePolyline = prevStep?.routeEncodedPolyline || step.routeEncodedPolyline;
    if (sourcePolyline) {
      const simplified = simplifyPolyline(sourcePolyline, 6000);
      pathParam = `&path=color:red|weight:4|enc:${encodeURIComponent(simplified)}`;
    }
  }

  // visible= pour que tous les points soient visibles
  const visible = depLat && depLng
    ? `${depLat},${depLng}|${arrLat},${arrLng}`
    : `${arrLat},${arrLng}`;

  return `https://maps.googleapis.com/maps/api/staticmap` +
    `?visible=${encodeURIComponent(visible)}` +
    `&size=480x160&scale=2&maptype=roadmap` +
    markers.map(m => `&markers=${encodeURIComponent(m)}`).join('') +
    pathParam +
    `&key=${key}`;
}

function buildOverviewMapUrl(coords) {
  if (!coords || coords.length === 0) return '';
  const key = process.env.GOOGLE_MAPS_API_KEY || '';

  // Utiliser visible= pour que tous les points soient cadrés sans marges excessives
  const visible = coords.join('|');

  const markers = coords.map((c, i) =>
    `&markers=${i === 0 ? 'color:green|label:1|' : i === coords.length - 1 ? 'color:red|label:' + (i + 1) + '|' : 'color:blue|label:' + (i + 1) + '|'}${c}`
  ).join('');

  // Relier les points par un chemin
  const pathCoords = coords.join('|');

  return `https://maps.googleapis.com/maps/api/staticmap` +
    `?visible=${encodeURIComponent(visible)}` +
    `&size=520x200&scale=2&maptype=roadmap` +
    `&path=color:red|weight:4|${pathCoords}` +
    markers +
    `&key=${key}`;
}

// ── Template HTML ────────────────────────────────────────────────────────────

function generateHTML(roadtrip) {
  const {
    title, startDate, endDate, coverPhotoUrl, steps = [],
    user, members = [],
  } = roadtrip;

  const owner = user;
  const totalDays = steps.length;
  const totalKm = steps.reduce((sum, s) => sum + (s.routeDistanceMeters || 0), 0);
  const totalDuration = steps.reduce((sum, s) => sum + (s.routeDurationSeconds || 0), 0);

  // Budget
  let totalAccomPrice = 0;
  let totalActivityCost = 0;
  let totalDeposits = 0;
  const currencyCounts = {};
  steps.forEach(s => {
    (s.accommodations || []).forEach(a => {
      if (a.totalPrice) {
        totalAccomPrice += a.totalPrice;
        currencyCounts[a.currency] = (currencyCounts[a.currency] || 0) + a.totalPrice;
      }
      if (a.depositPaid) totalDeposits += a.depositPaid;
    });
    (s.activities || []).forEach(a => {
      if (a.cost) {
        totalActivityCost += a.cost;
        currencyCounts[a.currency] = (currencyCounts[a.currency] || 0) + a.cost;
      }
      if (a.depositPaid) totalDeposits += a.depositPaid;
    });
  });

  const totalBudget = totalAccomPrice + totalActivityCost;
  const totalBalance = totalBudget - totalDeposits;

  const mainCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'EUR';

  // Construire les pages étapes
  const stepPages = steps.map((step, index) => {
    const dayNum = index + 1;
    // La route est stockée sur l'étape de DÉPART : steps[i].routeDistance = trajet steps[i] → steps[i+1]
    // Pour l'étape courante, on veut le trajet DEPUIS l'étape précédente, donc on regarde steps[i-1]
    const prevStepData = index > 0 ? steps[index - 1] : null;
    const hasRoute = prevStepData && (prevStepData.routeDistanceMeters || prevStepData.routeDurationSeconds);
    const accommodations = step.accommodations || [];
    const activities = step.activities || [];

    // Photos liées à cette étape
    const stepPhotos = step.photos || [];

    // Photos inline (max 2) — avec transformation Supabase pour réduire la taille
    const optimizeUrl = (url) => {
      if (url && url.includes('supabase.co/storage')) {
        return url + (url.includes('?') ? '&' : '?') + 'width=400&quality=60';
      }
      return url;
    };
    const photoImgs = stepPhotos.slice(0, 2).map(p =>
      `<img src="${optimizeUrl(p.url)}" alt="${p.caption || step.name}" class="step-photo" />`
    ).join('');

    // Carte Google Maps Static (avec ou sans tracé selon l'étape précédente)
    const prevStep = index > 0 ? steps[index - 1] : null;
    const stepMapUrl = buildStepMapUrl(step, prevStep, !hasRoute);

    return `
    <div class="page step-page">
      <div class="step-header">
        <div class="step-day">Jour ${dayNum}</div>
        <div class="step-title">${step.name}</div>
        ${step.location ? `<div class="step-location">${step.location}</div>` : ''}
        <div class="step-dates">
          ${formatDate(step.startDate)}${step.endDate ? ' → ' + formatDate(step.endDate) : ''}
        </div>
      </div>

      ${hasRoute ? `
      <div class="route-info-bar">
        <div class="route-stat">
          <span class="route-icon">🛣️</span>
          <span>${formatDistance(prevStepData.routeDistanceMeters)}</span>
        </div>
        <div class="route-stat">
          <span class="route-icon">⏱️</span>
          <span>${formatDuration(prevStepData.routeDurationSeconds)}</span>
        </div>
      </div>
      ` : ''}

      ${stepMapUrl ? `
      <div class="map-container${hasRoute ? '' : ' map-container-noroute'}">
        <img src="${stepMapUrl}" alt="Carte ${step.name}" class="step-map" />
      </div>
      ` : ''}

      <div class="step-details">
        ${accommodations.length > 0 ? `
        <div class="section">
          <h3 class="section-title">🏠 Hébergement${accommodations.length > 1 ? 's' : ''}</h3>
          ${accommodations.map(a => `
          <div class="accommodation-card">
            <div class="accom-type-badge">${a.type === 'HOTEL' ? '🏨' : a.type === 'CAMPING' ? '🏕️' : a.type === 'PARKING' ? '🅿️' : '🏠'} ${a.type}</div>
            <div class="accom-name">${a.name}</div>
            ${a.address ? `<div class="accom-address">${a.address}</div>` : ''}
            <div class="accom-details">
              ${a.checkIn ? `<span>🛏️ Arrivée : ${formatDate(a.checkIn)} ${formatTime(a.checkIn)}</span>` : ''}
              ${a.checkOut ? `<span>🚪 Départ : ${formatDate(a.checkOut)} ${formatTime(a.checkOut)}</span>` : ''}
              ${a.bookingRef ? `<span>🔖 Réf : ${a.bookingRef}</span>` : ''}
              ${a.totalPrice ? `<span>💰 ${formatMoney(a.totalPrice, a.currency)}</span>` : ''}
            </div>
            ${a.notes ? `<div class="accom-notes">${a.notes}</div>` : ''}
          </div>
          `).join('')}
        </div>
        ` : ''}

        ${activities.length > 0 ? `
        <div class="section">
          <h3 class="section-title">🎯 Activités</h3>
          ${activities.map(a => `
          <div class="activity-item">
            <div class="activity-time">${a.startTime ? formatTime(a.startTime) : ''}${a.endTime ? ' → ' + formatTime(a.endTime) : ''}</div>
            <div class="activity-content">
              <div class="activity-name">${a.type === 'RESTAURANT' ? '🍽️' : a.type === 'HIKING' ? '🥾' : a.type === 'SUPERMARKET' ? '🛒' : a.type === 'TRANSPORT' ? '🚗' : '📍'} ${a.name}</div>
              ${a.location ? `<div class="activity-location">${a.location}</div>` : ''}
              ${a.notes ? `<div class="activity-notes">${a.notes}</div>` : ''}
              ${a.cost ? `<div class="activity-cost">💰 ${formatMoney(a.cost, a.currency)}</div>` : ''}
            </div>
          </div>
          `).join('')}
        </div>
        ` : ''}

        ${step.notes ? `
        <div class="section">
          <h3 class="section-title">📝 Notes</h3>
          <div class="step-notes">${step.notes.replace(/\n/g, '<br/>')}</div>
        </div>
        ` : ''}

        ${photoImgs ? `
        <div class="section step-photos">
          ${photoImgs}
        </div>
        ` : ''}
      </div>
    </div>
    `;
  }).join('');

  // Carte Google Maps Static de la vue d'ensemble
  const allCoordStrings = steps
    .filter(s => s.latitude && s.longitude)
    .map(s => `${s.latitude},${s.longitude}`);
  const overviewMapUrl = buildOverviewMapUrl(allCoordStrings);

  const optimizeUrl = (url) => {
    if (!url) return url;
    if (url.includes('supabase.co/storage')) {
      return url + (url.includes('?') ? '&' : '?') + 'width=800&quality=70';
    }
    return url;
  };

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Roadbook — ${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  @page {
    size: A4;
    margin: 0;
  }

  body {
    font-family: 'Courier New', Courier, monospace;
    color: #3d2e1e;
    line-height: 1.5;
    background: #fef6e9;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  /* ═══ RETRO PATTERN ═══ */
  .retro-bg-dots {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(230,168,23,0.08) 1.5px, transparent 1.5px);
    background-size: 20px 20px;
    pointer-events: none;
  }

  /* ═══ COVER PAGE ═══ */
  .cover-page {
    background: linear-gradient(135deg, #e6a817 0%, #d4574a 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: #fff;
    padding: 40px 50px;
    position: relative;
    overflow: hidden;
    background-size: cover;
    background-position: center;
  }

  .cover-page.has-photo::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%);
  }

  .cover-page > * { position: relative; z-index: 1; }

  .cover-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.12;
  }
  .cover-circle:nth-child(1) { width: 220px; height: 220px; background: #f5c542; top: -60px; left: -60px; }
  .cover-circle:nth-child(2) { width: 140px; height: 140px; background: #e87a60; bottom: 30px; right: 40px; }
  .cover-circle:nth-child(3) { width: 80px; height: 80px; background: #f5c542; bottom: 100px; left: 50px; }

  .cover-badge {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    padding: 5px 20px;
    border: 2px solid rgba(255,255,255,0.4);
    font-size: 11px;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 56px;
    font-weight: 900;
    text-transform: uppercase;
    line-height: 1;
    text-shadow: 4px 4px 0 rgba(0,0,0,0.2);
    margin-bottom: 4px;
    letter-spacing: 2px;
  }

  .cover-title-year {
    display: block;
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 32px;
    letter-spacing: 12px;
    font-weight: 400;
    opacity: 0.9;
  }

  .cover-divider {
    width: 100px;
    height: 4px;
    background: rgba(255,255,255,0.4);
    margin: 16px auto;
    border-radius: 2px;
  }

  .cover-subtitle {
    font-size: 13px;
    letter-spacing: 4px;
    text-transform: uppercase;
    opacity: 0.7;
    font-weight: 400;
  }

  .cover-dates {
    font-size: 14px;
    opacity: 0.8;
    margin-top: 6px;
    letter-spacing: 2px;
  }

  .cover-footer {
    margin-top: 40px;
    font-size: 11px;
    opacity: 0.4;
    letter-spacing: 2px;
  }

  .cover-wavy {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50px;
    background: repeating-linear-gradient(
      -45deg,
      transparent, transparent 8px,
      rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 16px
    );
  }

  /* ═══ OVERVIEW PAGE ═══ */
  .overview-page {
    padding: 20px 28px;
    background: #fef6e9;
  }

  .page-title {
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 28px;
    color: #d4574a;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .page-subtitle {
    font-size: 12px;
    color: #b8a088;
    margin-bottom: 20px;
    letter-spacing: 1px;
    font-weight: 600;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }

  .stat-card {
    background: #fff;
    border: 2px solid #e6a817;
    padding: 12px 8px;
    text-align: center;
    position: relative;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: -3px; left: -3px; right: -3px; bottom: -3px;
    border: 1px solid #d4574a;
    pointer-events: none;
  }

  .stat-icon { font-size: 22px; margin-bottom: 4px; }
  .stat-value {
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: #d4574a;
  }
  .stat-label {
    font-size: 9px;
    color: #8a7a6a;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 2px;
  }

  .overview-map-container {
    border: 3px solid #e6a817;
    overflow: hidden;
    margin: 0 auto 20px;
    background: #f0e4cc;
    width: 75%;
  }

  .overview-map-container img { width: 100%; display: block; }
  .overview-map { width: 100%; display: block; }

  .itineraire-list {
    list-style: none;
    columns: 2;
    column-gap: 20px;
    column-rule: 1px dashed #e6a817;
  }

  .itineraire-item {
    display: flex;
    align-items: center;
    padding: 5px 0;
    border-bottom: 1px dashed #e6a817;
    break-inside: avoid;
  }

  .itineraire-item:last-child { border-bottom: none; }

  .itineraire-day {
    width: 28px; height: 28px;
    background: #e6a817;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 12px;
    margin-right: 8px;
    flex-shrink: 0;
  }

  .itineraire-info { flex: 1; min-width: 0; }
  .itineraire-name { font-weight: 700; font-size: 13px; color: #3d2e1e; }
  .itineraire-meta { font-size: 10px; color: #8a7a6a; margin-top: 1px; }

  /* ═══ STEP PAGE ═══ */
  .step-page { padding: 0; background: #fef6e9; }

  .step-header {
    background: linear-gradient(135deg, #d4574a 0%, #e6a817 100%);
    color: #fff;
    padding: 16px 30px;
    position: relative;
  }

  .step-header::after {
    content: '✦';
    position: absolute;
    bottom: -14px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 18px;
    color: #e6a817;
    background: #fef6e9;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 2px solid #d4574a;
  }

  .step-day {
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    opacity: 0.7;
    font-weight: 600;
  }

  .step-title {
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 30px;
    text-transform: uppercase;
    letter-spacing: 1px;
    line-height: 1.1;
    margin-top: 2px;
  }

  .step-location {
    font-size: 14px;
    opacity: 0.8;
    margin-top: 4px;
    letter-spacing: 1px;
  }

  .step-dates {
    font-size: 12px;
    opacity: 0.6;
    margin-top: 6px;
    letter-spacing: 1px;
  }

  .route-info-bar {
    display: flex;
    gap: 20px;
    padding: 8px 36px;
    background: #e6a817;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 1px;
  }

  .route-stat { display: flex; align-items: center; gap: 6px; }
  .route-icon { font-size: 16px; }

  .map-container {
    width: 80%;
    margin: 0 auto;
    overflow: hidden;
    background: #f0e4cc;
    border-bottom: 4px double #e6a817;
  }

  .map-container-noroute {
    border-bottom: none;
    border: 2px solid #e6a817;
    margin: 0 auto 16px;
    width: 70%;
  }

  .map-container img { width: 100%; display: block; }
  .step-map { width: 100%; display: block; }

  .step-details { padding: 18px 30px 24px; }

  .section { margin-bottom: 25px; }

  .section-title {
    font-family: 'Impact', 'Arial Black', sans-serif;
    font-size: 16px;
    color: #d4574a;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 3px double #e6a817;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .accommodation-card {
    background: #fff;
    border: 2px solid #e6a817;
    padding: 14px;
    margin-bottom: 10px;
    position: relative;
  }

  .accom-type-badge {
    display: inline-block;
    background: #d4574a;
    color: #fff;
    padding: 2px 10px;
    font-size: 10px;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 6px;
    font-weight: 600;
  }

  .accom-name { font-size: 16px; font-weight: 700; color: #3d2e1e; }
  .accom-address { font-size: 12px; color: #8a7a6a; margin-top: 2px; }

  .accom-details {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
    color: #6a5a4a;
  }

  .accom-notes {
    margin-top: 8px;
    font-size: 12px;
    color: #8a7a6a;
    font-style: italic;
    padding: 8px;
    background: #fef6e9;
    border: 1px dashed #e6a817;
  }

  .activity-item {
    display: flex;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px dashed #e6a817;
  }

  .activity-item:last-child { border-bottom: none; }

  .activity-time {
    min-width: 80px;
    font-size: 12px;
    color: #8a7a6a;
    font-weight: 600;
    padding-top: 2px;
  }

  .activity-content { flex: 1; }
  .activity-name { font-weight: 700; font-size: 14px; color: #3d2e1e; }
  .activity-location { font-size: 12px; color: #8a7a6a; }
  .activity-notes { font-size: 12px; color: #6a5a4a; margin-top: 2px; }
  .activity-cost { font-size: 12px; color: #d4574a; font-weight: 600; margin-top: 2px; }

  .step-notes {
    font-size: 13px;
    color: #3d2e1e;
    line-height: 1.6;
    padding: 12px 16px;
    background: #fff;
    border-left: 4px solid #e6a817;
    font-style: italic;
  }

  .step-photos { display: flex; gap: 10px; margin-top: 15px; }

  .step-photo {
    width: calc(50% - 5px);
    height: 180px;
    object-fit: cover;
    border: 3px solid #e6a817;
  }

  /* ═══ SUMMARY PAGE ═══ */
  .summary-page {
    padding: 24px 36px;
    background: #fef6e9;
  }

  .budget-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
    border: 2px solid #e6a817;
  }

  .budget-table th {
    text-align: left;
    padding: 10px 12px;
    background: #d4574a;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .budget-table td {
    padding: 10px 12px;
    border-bottom: 1px dashed #e6a817;
    font-size: 14px;
    background: #fff;
  }

  .budget-table tr:last-child td { border-bottom: none; }

  .budget-deposit td {
    background: #fff8f0;
    border-bottom: 1px dashed #e6a817;
  }

  .budget-balance td {
    background: #fff8f0;
  }

  .budget-total td {
    font-weight: 700;
    background: #fef6e9;
    border-top: 3px double #d4574a;
    color: #d4574a;
  }

  .members-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }

  .member-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #fff;
    border: 2px solid #e6a817;
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #3d2e1e;
  }

  .member-avatar {
    width: 24px; height: 24px;
    background: #e6a817;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }

  .footer-note {
    margin-top: 40px;
    text-align: center;
    font-size: 11px;
    color: #b8a088;
    border-top: 2px dashed #e6a817;
    padding-top: 16px;
    letter-spacing: 1px;
  }

  @media print {
    body { background: #fef6e9; }
    .page { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>

  <!-- ═══ COVER ═══ -->
  <div class="page cover-page${coverPhotoUrl ? ' has-photo' : ''}"${coverPhotoUrl ? ` style="background-image: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url('${optimizeUrl(coverPhotoUrl)}')"` : ''}>
    <div class="cover-circle"></div>
    <div class="cover-circle"></div>
    <div class="cover-circle"></div>
    <div class="retro-bg-dots"></div>
    <div class="cover-wavy"></div>
    <div class="cover-content">
      <div class="cover-badge">★ Roadbook ★</div>
      <h1 class="cover-title">${title}</h1>
      <div class="cover-divider"></div>
      ${owner?.name ? `<div class="cover-subtitle">Avec ${owner.name}</div>` : ''}
      <div class="cover-dates">${formatDateRange(startDate, endDate)}</div>
      <div class="cover-footer">Mon Petit Roadtrip • roadtrip.harmonixe.fr</div>
    </div>
  </div>

  <!-- ═══ OVERVIEW ═══ -->
  <div class="page overview-page">
    <h2 class="page-title">Vue d'ensemble</h2>
    <p class="page-subtitle">${steps.length} étapes • ${formatDistance(totalKm)} • ${formatDuration(totalDuration)} de route</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📍</div>
        <div class="stat-value">${steps.length}</div>
        <div class="stat-label">Étapes</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🛣️</div>
        <div class="stat-value">${formatDistance(totalKm)}</div>
        <div class="stat-label">Distance totale</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏱️</div>
        <div class="stat-value">${formatDuration(totalDuration)}</div>
        <div class="stat-label">Temps de route</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🏠</div>
        <div class="stat-value">${steps.reduce((s, st) => s + (st.accommodations?.length || 0), 0)}</div>
        <div class="stat-label">Hébergements</div>
      </div>
    </div>

    ${overviewMapUrl ? `
    <div class="overview-map-container">
      <img src="${overviewMapUrl}" alt="Carte du roadtrip" class="overview-map" />
    </div>
    ` : ''}

    <h3 style="font-family:'Impact','Arial Black',sans-serif;font-size:20px;color:#d4574a;margin-bottom:14px;text-transform:uppercase;letter-spacing:1px;">🗺️ Itinéraire</h3>
    <ul class="itineraire-list">
      ${steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1] : null;
        const routeKm = prev?.routeDistanceMeters ? formatDistance(prev.routeDistanceMeters) : '';
        const routeDur = prev?.routeDurationSeconds ? formatDuration(prev.routeDurationSeconds) : '';
        const routeStr = routeKm && routeDur ? ` • ${routeKm} • ${routeDur}` : routeKm || routeDur ? ` • ${routeKm}${routeDur}` : '';
        const dateLabel = s.startDate ? formatDate(s.startDate) : '';
        return `
      <li class="itineraire-item">
        <div class="itineraire-day">${i + 1}</div>
        <div class="itineraire-info">
          <div class="itineraire-name">${s.name}</div>
          <div class="itineraire-meta">
            ${dateLabel ? `${dateLabel}${s.location ? ' · ' : ''}` : ''}${s.location || ''}${routeStr}
          </div>
        </div>
      </li>
      `;}).join('')}
    </ul>
  </div>

  <!-- ═══ STEP PAGES ═══ -->
  ${stepPages}

  <!-- ═══ SUMMARY PAGE ═══ -->
  <div class="page summary-page">
    <h2 class="page-title">Récapitulatif</h2>
    <p class="page-subtitle">Budget et informations du roadtrip</p>

    <div class="section">
      <h3 class="section-title">💰 Budget</h3>
      <table class="budget-table">
        <thead>
          <tr>
            <th>Catégorie</th>
            <th style="text-align:right">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Hébergements</td>
            <td style="text-align:right">${formatMoney(totalAccomPrice, mainCurrency)}</td>
          </tr>
          <tr>
            <td>Activités</td>
            <td style="text-align:right">${formatMoney(totalActivityCost, mainCurrency)}</td>
          </tr>
          <tr class="budget-deposit">
            <td style="color:#8a7a6a;">💳 Acomptes versés</td>
            <td style="text-align:right;color:#8a7a6a;">${formatMoney(totalDeposits, mainCurrency)}</td>
          </tr>
          <tr class="budget-balance">
            <td style="color:#d4574a;">📅 Reste à payer</td>
            <td style="text-align:right;color:${totalBalance > 0 ? '#d4574a' : '#22c55e'};font-weight:600;">
              ${formatMoney(Math.max(totalBalance, 0), mainCurrency)}
            </td>
          </tr>
          <tr class="budget-total">
            <td>💰 Budget total</td>
            <td style="text-align:right">${formatMoney(totalBudget, mainCurrency)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${members.length > 0 ? `
    <div class="section">
      <h3 class="section-title">👥 Voyageurs</h3>
      <div class="members-list">
        ${members.map(m => `
        <div class="member-chip">
          <div class="member-avatar">${(m.user?.name || m.email || '?')[0].toUpperCase()}</div>
          <span>${m.user?.name || m.email}</span>
          <span style="font-size:11px;color:#a0aec0;">${m.role === 'OWNER' ? '👑' : m.role === 'EDITOR' ? '✏️' : '👁️'}</span>
        </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="footer-note">
      Généré par Mon Petit Roadtrip • ${new Date().toLocaleDateString('fr-FR')}
    </div>
  </div>

</body>
</html>`;
}

// ── Helpers pour charger/enrichir un roadtrip ────────────────────────────────

async function loadAndEnrichRoadtrip(roadtripId, userId) {
  const roadtrip = await prisma.roadtrip.findUnique({
    where: { id: roadtripId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      steps: {
        orderBy: { order: 'asc' },
        include: {
          accommodations: { orderBy: { checkIn: 'asc' } },
          activities: { orderBy: { startTime: 'asc' } },
        },
      },
    },
  });

  if (!roadtrip) throw Object.assign(new Error('Roadtrip non trouvé'), { status: 404 });

  const isOwner = roadtrip.userId === userId;
  const isMember = roadtrip.members.some(m => m.userId === userId && m.status === 'ACCEPTED');
  if (!isOwner && !isMember) throw Object.assign(new Error('Accès refusé'), { status: 403 });

  const stepIds = roadtrip.steps.map(s => s.id);
  const allPhotos = await prisma.photo.findMany({
    where: { OR: [{ roadtripId }, { stepId: { in: stepIds } }] },
    orderBy: { createdAt: 'asc' },
  });

  const stepsWithPhotos = roadtrip.steps.map(step => ({
    ...step,
    photos: allPhotos.filter(p => p.stepId === step.id),
  }));

  return {
    ...roadtrip,
    steps: stepsWithPhotos,
    coverPhotoUrl: roadtrip.coverPhotoUrl || allPhotos.find(p => p.isCover)?.url || null,
  };
}

/**
 * Upload un buffer PDF vers Supabase Storage.
 */
async function uploadPdfToStorage(buffer, filename) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

  const storagePath = `roadbooks/${Date.now()}_${filename}`;
  const res = await fetch(`${supabaseUrl}/storage/v1/object/roadbooks/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/pdf',
    },
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase upload failed: ${detail}`);
  }

  return {
    url: `${supabaseUrl}/storage/v1/object/public/roadbooks/${storagePath}`,
    storagePath,
  };
}

/**
 * Génère le PDF (Puppeteer) à partir du roadtrip enrichi.
 */
async function generatePdfFromHTML(html) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Génération asynchrone du roadbook (lancée en arrière-plan).
 */
async function generateRoadbookJob(roadbookId, roadtrip, enriched) {
  try {
    // ⏳ Statut → generating
    await prisma.roadbook.update({
      where: { id: roadbookId },
      data: { status: 'generating' },
    });

    // 1. Générer le HTML
    let html = generateHTML(enriched);

    // 2. Redimensionner les photos
    const photoRegex = /<img[^>]+src="([^"]*supabase\.co[^"]*)"[^>]*class="step-photo"[^>]*>/g;
    let photoCount = 0;
    let match;
    while ((match = photoRegex.exec(html)) !== null) {
      const full = match[0];
      const src = match[1];
      const dataUri = await resizeToDataUri(src);
      html = html.replace(full, full.replace(src, dataUri));
      photoCount++;
    }
    const coverRegex = /url\('([^']*supabase\.co[^']*)'\)/g;
    while ((match = coverRegex.exec(html)) !== null) {
      const url = match[1];
      const dataUri = await resizeToDataUri(url, 700, 60);
      html = html.replace(url, dataUri);
      photoCount++;
    }

    // 3. Générer le PDF
    const pdfBuffer = await generatePdfFromHTML(html);

    // 4. Uploader vers Supabase Storage
    const filename = `roadbook-${roadtrip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}.pdf`;
    const { url } = await uploadPdfToStorage(pdfBuffer, filename);

    // 5. ✅ Statut → ready
    await prisma.roadbook.update({
      where: { id: roadbookId },
      data: { status: 'ready', fileUrl: url, fileSize: pdfBuffer.length },
    });

    console.log(`✅ Roadbook généré : ${url} (${pdfBuffer.length} bytes)`);
  } catch (err) {
    console.error(`❌ Roadbook #${roadbookId} échec :`, err.message);
    await prisma.roadbook.update({
      where: { id: roadbookId },
      data: { status: 'error', error: err.message },
    }).catch(() => {});
  }
}

// ── Route : GET /api/roadtrips/:roadtripId/roadbook (preview HTML) ───────────

router.get('/:roadtripId/roadbook', auth, async (req, res, next) => {
  try {
    const { roadtripId } = req.params;
    const { preview } = req.query;
    const userId = req.user.userId;

    const enriched = await loadAndEnrichRoadtrip(roadtripId, userId);
    const html = generateHTML(enriched);

    if (preview === '1') return res.send(html);
    return res.status(400).json({ error: 'Utilise POST /generate pour générer le PDF ou ?preview=1 pour le HTML' });
  } catch (e) {
    next(e);
  }
});

// ── Route : POST /api/roadtrips/:roadtripId/roadbook/generate ────────────────

router.post('/:roadtripId/roadbook/generate', auth, async (req, res, next) => {
  try {
    const { roadtripId } = req.params;
    const userId = req.user.userId;

    const enriched = await loadAndEnrichRoadtrip(roadtripId, userId);

    // Créer l'enregistrement Roadbook (statut pending)
    const rb = await prisma.roadbook.create({
      data: { roadtripId, status: 'pending' },
    });

    // Lancer la génération en arrière-plan (sans attendre)
    generateRoadbookJob(rb.id, enriched, enriched).catch(err => {
      console.error(`[RoadbookJob] Erreur fatale:`, err);
    });

    res.status(201).json({ id: rb.id, status: 'pending' });
  } catch (e) {
    next(e);
  }
});

// ── Route : GET /api/roadtrips/:roadtripId/roadbook/list ──────────────────────

router.get('/:roadtripId/roadbook/list', auth, async (req, res, next) => {
  try {
    const { roadtripId } = req.params;
    const userId = req.user.userId;

    await loadAndEnrichRoadtrip(roadtripId, userId); // vérifie l'accès

    const list = await prisma.roadbook.findMany({
      where: { roadtripId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        fileUrl: true,
        fileSize: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(list);
  } catch (e) {
    next(e);
  }
});

// ── Route : GET /api/roadtrips/:roadtripId/roadbook/download/:roadbookId ─────

router.get('/:roadtripId/roadbook/download/:roadbookId', auth, async (req, res, next) => {
  try {
    const { roadtripId, roadbookId } = req.params;
    const userId = req.user.userId;

    await loadAndEnrichRoadtrip(roadtripId, userId); // vérifie l'accès

    const rb = await prisma.roadbook.findFirst({
      where: { id: roadbookId, roadtripId },
    });

    if (!rb) return res.status(404).json({ error: 'Roadbook non trouvé' });
    if (rb.status !== 'ready' || !rb.fileUrl) {
      return res.status(400).json({ error: `Roadbook non disponible (statut: ${rb.status})` });
    }

    // Proxy : télécharger depuis Supabase et renvoyer
    const resp = await fetch(rb.fileUrl);
    if (!resp.ok) throw new Error('Impossible de récupérer le PDF depuis le stockage');

    const buffer = Buffer.from(await resp.arrayBuffer());
    const filename = `roadbook-${roadtripId.slice(0, 8)}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  } catch (e) {
    next(e);
  }
});

/**
 * Supprime un fichier du bucket Supabase roadbooks.
 */
async function deleteFromStorage(storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey || !storagePath) return;
  await fetch(`${supabaseUrl}/storage/v1/object/roadbooks/${storagePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serviceKey}` },
  }).catch(() => {});
}

// ── Route : DELETE /api/roadtrips/:roadtripId/roadbook/:roadbookId ──────────────

router.delete('/:roadtripId/roadbook/:roadbookId', auth, async (req, res, next) => {
  try {
    const { roadtripId, roadbookId } = req.params;
    const userId = req.user.userId;

    await loadAndEnrichRoadtrip(roadtripId, userId); // vérifie l'accès

    const rb = await prisma.roadbook.findFirst({
      where: { id: roadbookId, roadtripId },
    });

    if (!rb) return res.status(404).json({ error: 'Roadbook non trouvé' });

    // Supprimer le fichier Supabase si présent
    if (rb.fileUrl) {
      const storagePath = rb.fileUrl.split('/').slice(-2).join('/');
      await deleteFromStorage(storagePath);
    }

    await prisma.roadbook.delete({ where: { id: roadbookId } });

    res.status(204).send();
  } catch (e) {
    next(e);
  }
});

module.exports = router;
