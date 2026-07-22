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
 * Logique de tracé :
 * - Départ  → point de départ EFFECTIF de l'étape PRÉCÉDENTE
 *              (item isDeparture de prevStep, ou prevStep.departureLatitude, ou prevStep lui-même)
 * - Arrivée → point d'arrivée EFFECTIF de l'étape COURANTE
 *              (item isArrival de step, ou step.arrivalLatitude, ou step lui-même)
 * - Polyline → routeEncodedPolyline de l'étape PRÉCÉDENTE
 *              (stockée sur prevStep = route FROM prevStep TO step)
 *
 * @param {object} step - L'étape courante
 * @param {object|null} prevStep - L'étape précédente
 * @param {object|null} nextStep - Non utilisé (conservé pour signature)
 */
function buildStepMapUrl(step, prevStep, nextStep) {
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
  if (depLat && depLng) {
    markers.push(`color:green|label:D|${depLat},${depLng}`);
  }
  markers.push(`color:red|label:A|${arrLat},${arrLng}`);

  // ── Polyline : celle de l'étape PRÉCÉDENTE (route FROM prevStep TO step) ──
  let pathParam = '';
  const sourcePolyline = prevStep?.routeEncodedPolyline || step.routeEncodedPolyline;
  if (sourcePolyline) {
    const simplified = simplifyPolyline(sourcePolyline, 6000);
    pathParam = `&path=color:red|weight:4|enc:${encodeURIComponent(simplified)}`;
  }

  // visible= pour que départ ET arrivée soient visibles
  const visible = depLat && depLng
    ? `${depLat},${depLng}|${arrLat},${arrLng}`
    : `${arrLat},${arrLng}`;

  return `https://maps.googleapis.com/maps/api/staticmap` +
    `?visible=${encodeURIComponent(visible)}` +
    `&size=640x220&scale=2&maptype=roadmap` +
    markers.map(m => `&markers=${encodeURIComponent(m)}`).join('') +
    pathParam +
    `&key=${key}`;
}

function buildOverviewMapUrl(coords) {
  if (!coords || coords.length === 0) return '';
  const key = process.env.GOOGLE_MAPS_API_KEY || '';

  const markers = coords.map((c, i) =>
    `&markers=${i === 0 ? 'color:green|label:1|' : i === coords.length - 1 ? 'color:red|label:' + (i + 1) + '|' : 'color:blue|label:' + (i + 1) + '|'}${c}`
  ).join('');

  const center = coords[Math.floor(coords.length / 2)];
  const zoom = coords.length <= 3 ? 8 : coords.length <= 8 ? 6 : 5;

  // Relier les points par un chemin pour voir le trajet complet
  const pathCoords = coords.join('|');

  return `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${center}` +
    `&zoom=${zoom}&size=700x300&scale=2&maptype=roadmap` +
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
  const currencyCounts = {};
  steps.forEach(s => {
    (s.accommodations || []).forEach(a => {
      if (a.totalPrice) {
        totalAccomPrice += a.totalPrice;
        currencyCounts[a.currency] = (currencyCounts[a.currency] || 0) + a.totalPrice;
      }
    });
    (s.activities || []).forEach(a => {
      if (a.cost) {
        totalActivityCost += a.cost;
        currencyCounts[a.currency] = (currencyCounts[a.currency] || 0) + a.cost;
      }
    });
  });

  const mainCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'EUR';

  // Construire les pages étapes
  const stepPages = steps.map((step, index) => {
    const dayNum = index + 1;
    const hasRoute = step.routeDistanceMeters || step.routeDurationSeconds;
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

    // Carte Google Maps Static (avec l'étape précédente pour le départ et la suivante pour l'arrivée)
    const prevStep = index > 0 ? steps[index - 1] : null;
    const nextStep = index < steps.length - 1 ? steps[index + 1] : null;
    const stepMapUrl = buildStepMapUrl(step, prevStep, nextStep);

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
          <span>${formatDistance(step.routeDistanceMeters)}</span>
        </div>
        <div class="route-stat">
          <span class="route-icon">⏱️</span>
          <span>${formatDuration(step.routeDurationSeconds)}</span>
        </div>
      </div>
      ` : ''}

      ${stepMapUrl ? `
      <div class="map-container">
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
  const coverBg = coverPhotoUrl
    ? `style="background-image: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url('${optimizeUrl(coverPhotoUrl)}')"`
    : 'style="background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%)"';

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
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a202c;
    line-height: 1.6;
    background: #f7fafc;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  /* ═══ COVER PAGE ═══ */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background-size: cover;
    background-position: center;
    color: white;
    padding: 40px 50px;
    position: relative;
  }

  .cover-page::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.1) 100%);
  }

  .cover-content {
    position: relative;
    z-index: 1;
  }

  .cover-badge {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    backdrop-filter: blur(10px);
    padding: 6px 18px;
    border-radius: 20px;
    font-size: 12px;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 20px;
    border: 1px solid rgba(255,255,255,0.3);
  }

  .cover-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 52px;
    font-weight: 900;
    line-height: 1.1;
    margin-bottom: 10px;
    text-shadow: 0 2px 20px rgba(0,0,0,0.3);
  }

  .cover-subtitle {
    font-size: 20px;
    font-weight: 300;
    opacity: 0.9;
    margin-bottom: 30px;
  }

  .cover-dates {
    font-size: 16px;
    opacity: 0.8;
    font-weight: 300;
  }

  .cover-divider {
    width: 60px;
    height: 3px;
    background: white;
    margin: 15px 0;
    border-radius: 2px;
  }

  .cover-footer {
    margin-top: 40px;
    font-size: 13px;
    opacity: 0.6;
  }

  /* ═══ OVERVIEW PAGE ═══ */
  .overview-page {
    padding: 40px 50px;
    background: white;
  }

  .page-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 32px;
    color: #1a365d;
    margin-bottom: 5px;
  }

  .page-subtitle {
    font-size: 14px;
    color: #718096;
    margin-bottom: 30px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;
    margin-bottom: 35px;
  }

  .stat-card {
    background: #f7fafc;
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    border: 1px solid #e2e8f0;
  }

  .stat-icon {
    font-size: 28px;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: #2d3748;
  }

  .stat-label {
    font-size: 12px;
    color: #718096;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
  }

  .overview-map-container {
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    margin-bottom: 25px;
    background: #f0f0f0;
  }

  .overview-map-container img {
    width: 100%;
    display: block;
  }

  .map-placeholder {
    width: 100%;
    height: 180px;
    background: linear-gradient(135deg, #e2e8f0, #cbd5e0);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #718096;
    font-size: 14px;
  }

  .itineraire-list {
    list-style: none;
  }

  .itineraire-item {
    display: flex;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .itineraire-item:last-child { border-bottom: none; }

  .itineraire-day {
    width: 40px;
    height: 40px;
    background: #1a365d;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    margin-right: 15px;
    flex-shrink: 0;
  }

  .itineraire-info {
    flex: 1;
  }

  .itineraire-name {
    font-weight: 600;
    font-size: 15px;
  }

  .itineraire-meta {
    font-size: 13px;
    color: #718096;
  }

  /* ═══ STEP PAGE ═══ */
  .step-page {
    padding: 0;
    background: white;
  }

  .step-header {
    background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%);
    color: white;
    padding: 30px 50px;
  }

  .step-day {
    font-size: 12px;
    letter-spacing: 3px;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 5px;
  }

  .step-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 28px;
    font-weight: 700;
  }

  .step-location {
    font-size: 15px;
    opacity: 0.8;
    margin-top: 4px;
  }

  .step-dates {
    font-size: 13px;
    opacity: 0.6;
    margin-top: 6px;
  }

  .route-info-bar {
    display: flex;
    gap: 15px;
    padding: 12px 50px;
    background: #f7fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .route-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: #4a5568;
  }

  .route-icon { font-size: 16px; }

  .map-container {
    width: 100%;
    overflow: hidden;
    background: #f0f0f0;
  }

  .map-container img {
    width: 100%;
    display: block;
  }

  .step-map {
    width: 100%;
    display: block;
  }

  .overview-map {
    width: 100%;
    display: block;
  }

  .step-details {
    padding: 25px 50px 40px;
  }

  .section {
    margin-bottom: 25px;
  }

  .section-title {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18px;
    color: #1a365d;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #e2e8f0;
  }

  .accommodation-card {
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 10px;
  }

  .accom-type-badge {
    font-size: 12px;
    color: #718096;
    margin-bottom: 4px;
  }

  .accom-name {
    font-size: 16px;
    font-weight: 600;
  }

  .accom-address {
    font-size: 13px;
    color: #718096;
    margin-top: 2px;
  }

  .accom-details {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 8px;
    font-size: 13px;
    color: #4a5568;
  }

  .accom-notes {
    margin-top: 8px;
    font-size: 13px;
    color: #718096;
    font-style: italic;
    padding: 8px;
    background: #edf2f7;
    border-radius: 6px;
  }

  .activity-item {
    display: flex;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .activity-item:last-child { border-bottom: none; }

  .activity-time {
    min-width: 80px;
    font-size: 12px;
    color: #718096;
    font-weight: 500;
    padding-top: 2px;
  }

  .activity-content { flex: 1; }

  .activity-name {
    font-weight: 600;
    font-size: 14px;
  }

  .activity-location {
    font-size: 13px;
    color: #718096;
  }

  .activity-notes {
    font-size: 13px;
    color: #4a5568;
    margin-top: 3px;
  }

  .activity-cost {
    font-size: 13px;
    color: #38a169;
    font-weight: 500;
    margin-top: 2px;
  }

  .step-notes {
    font-size: 14px;
    color: #4a5568;
    line-height: 1.7;
    padding: 12px;
    background: #fffbeb;
    border-left: 3px solid #d69e2e;
    border-radius: 0 6px 6px 0;
  }

  .step-photos {
    display: flex;
    gap: 10px;
    margin-top: 15px;
  }

  .step-photo {
    width: calc(50% - 5px);
    height: 180px;
    object-fit: cover;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  /* ═══ SUMMARY PAGE ═══ */
  .summary-page {
    padding: 40px 50px;
    background: white;
  }

  .budget-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
  }

  .budget-table th {
    text-align: left;
    padding: 10px 12px;
    background: #1a365d;
    color: white;
    font-size: 13px;
    font-weight: 600;
  }

  .budget-table th:first-child { border-radius: 8px 0 0 0; }
  .budget-table th:last-child { border-radius: 0 8px 0 0; }

  .budget-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 14px;
  }

  .budget-table tr:last-child td { border-bottom: none; }

  .budget-total td {
    font-weight: 700;
    background: #f7fafc;
    border-top: 2px solid #1a365d;
  }

  .members-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 15px;
  }

  .member-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #f7fafc;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
  }

  .member-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #1a365d;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }

  .footer-note {
    margin-top: 40px;
    text-align: center;
    font-size: 12px;
    color: #a0aec0;
    border-top: 1px solid #e2e8f0;
    padding-top: 20px;
  }

  @media print {
    body { background: white; }
    .page { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>

  <!-- ═══ COVER ═══ -->
  <div class="page cover-page" ${coverBg}>
    <div class="cover-content">
      <div class="cover-badge">Roadbook</div>
      <h1 class="cover-title">${title}</h1>
      ${owner?.name ? `<div class="cover-subtitle">Par ${owner.name}</div>` : ''}
      <div class="cover-divider"></div>
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

    <h3 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1a365d;margin-bottom:12px;">🗺️ Itinéraire</h3>
    <ul class="itineraire-list">
      ${steps.map((s, i) => `
      <li class="itineraire-item">
        <div class="itineraire-day">${i + 1}</div>
        <div class="itineraire-info">
          <div class="itineraire-name">${s.name}</div>
          <div class="itineraire-meta">
            ${s.location || ''}
            ${s.routeDistanceMeters ? ' • ' + formatDistance(s.routeDistanceMeters) : ''}
            ${s.routeDurationSeconds ? ' • ' + formatDuration(s.routeDurationSeconds) : ''}
          </div>
        </div>
      </li>
      `).join('')}
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
          <tr class="budget-total">
            <td>Total</td>
            <td style="text-align:right">${formatMoney(totalAccomPrice + totalActivityCost, mainCurrency)}</td>
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

// ── Route : GET /api/roadtrips/:roadtripId/roadbook ──────────────────────────

router.get('/:roadtripId/roadbook', auth, async (req, res, next) => {
  try {
    const { roadtripId } = req.params;
    const { preview } = req.query;

    // Vérifier l'accès
    const userId = req.user.userId;

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

    if (!roadtrip) {
      return res.status(404).json({ error: 'Roadtrip non trouvé' });
    }

    // Vérifier que l'utilisateur est owner ou member ACCEPTED
    const isOwner = roadtrip.userId === userId;
    const isMember = roadtrip.members.some(
      m => m.userId === userId && m.status === 'ACCEPTED'
    );
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Récupérer les photos associées
    const stepIds = roadtrip.steps.map(s => s.id);
    const allPhotos = await prisma.photo.findMany({
      where: {
        OR: [
          { roadtripId },
          { stepId: { in: stepIds } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Associer les photos aux étapes
    const stepsWithPhotos = roadtrip.steps.map(step => ({
      ...step,
      photos: allPhotos.filter(p => p.stepId === step.id),
    }));

    const enrichedRoadtrip = {
      ...roadtrip,
      steps: stepsWithPhotos,
      coverPhotoUrl: roadtrip.coverPhotoUrl || allPhotos.find(p => p.isCover)?.url || null,
    };

    // Générer le HTML
    let html = generateHTML(enrichedRoadtrip);

    // Mode preview : retourner le HTML
    if (preview === '1') {
      return res.send(html);
    }

    // Redimensionner UNIQUEMENT les photos (pas les cartes Google Maps qui sont déjà optimisées)
    console.log(`🖼️ Redimensionnement des photos pour le PDF...`);
    const photoRegex = /<img[^>]+src="([^"]*supabase\.co[^"]*)"[^>]*class="step-photo"[^>]*>/g;
    let photoMatch;
    let photoCount = 0;
    while ((photoMatch = photoRegex.exec(html)) !== null) {
      const full = photoMatch[0];
      const src = photoMatch[1];
      const dataUri = await resizeToDataUri(src);
      html = html.replace(full, full.replace(src, dataUri));
      photoCount++;
    }
    // Redimensionner aussi l'image de couverture (background-image)
    const coverRegex = /url\('([^']*supabase\.co[^']*)'\)/g;
    let coverMatch;
    while ((coverMatch = coverRegex.exec(html)) !== null) {
      const url = coverMatch[1];
      const dataUri = await resizeToDataUri(url, 700, 60);
      html = html.replace(url, dataUri);
      photoCount++;
    }
    console.log(`✅ ${photoCount} photo(s) redimensionnée(s)`);

    // Générer le PDF avec Puppeteer
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

      // Charger le HTML avec timeout long pour les images Google Maps
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      // Laisser le temps aux images Google Maps de finir de charger
      await new Promise(r => setTimeout(r, 5000));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
        preferCSSPageSize: true,
      });

      // S'assurer que c'est un vrai Buffer (Puppeteer peut retourner Uint8Array)
      const pdfBinary = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

      const filename = `roadbook-${roadtrip.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}.pdf`;

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBinary.length,
      });

      res.end(pdfBinary);
    } finally {
      await browser.close();
    }
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.generateHTML = generateHTML;
