/**
 * routes-rp/weather.js — Météo via Open-Meteo (gratuit, sans clé)
 *
 * GET /api/weather?lat=48.85&lng=2.35&date=2026-03-16
 * POST /api/weather/batch  → { steps: [{ lat, lng, date, name }] }
 */

const express = require('express');
const router = express.Router();

// ─── Mapping WMO → emoji ────────────────────────────────────────────────────
const WMO_ICONS = {
  0: '☀️',       // Ciel dégagé
  1: '🌤️',       // Principalement clair
  2: '⛅',        // Partiellement nuageux
  3: '☁️',        // Nuageux
  45: '🌫️',      // Brouillard
  48: '🌫️',      // Brouillard givrant
  51: '🌦️',      // Bruine légère
  53: '🌦️',      // Bruine modérée
  55: '🌦️',      // Bruine dense
  56: '🌦️',      // Bruine verglaçante légère
  57: '🌦️',      // Bruine verglaçante dense
  61: '🌧️',      // Pluie légère
  63: '🌧️',      // Pluie modérée
  65: '🌧️',      // Pluie forte
  66: '🌧️',      // Pluie verglaçante légère
  67: '🌧️',      // Pluie verglaçante forte
  71: '🌨️',      // Chute de neige légère
  73: '🌨️',      // Chute de neige modérée
  75: '🌨️',      // Chute de neige forte
  77: '🌨️',      // Grains de neige
  80: '🌦️',      // Averses de pluie légères
  81: '🌦️',      // Averses de pluie modérées
  82: '🌧️',      // Averses de pluie violentes
  85: '🌨️',      // Averses de neige légères
  86: '🌨️',      // Averses de neige fortes
  95: '⛈️',      // Orage léger ou modéré
  96: '⛈️',      // Orage avec grêle légère
  99: '⛈️',      // Orage avec grêle forte
};

function getWeatherIcon(wmoCode) {
  return WMO_ICONS[wmoCode] || '🌡️';
}

function getWeatherLabel(wmoCode) {
  const labels = {
    0: 'Dégagé', 1: 'Plutôt clair', 2: 'Partiellement nuageux', 3: 'Nuageux',
    45: 'Brouillard', 48: 'Brouillard givrant',
    51: 'Bruine', 53: 'Bruine', 55: 'Bruine', 56: 'Bruine verglaçante', 57: 'Bruine verglaçante',
    61: 'Pluie faible', 63: 'Pluie', 65: 'Pluie forte',
    66: 'Pluie verglaçante', 67: 'Pluie verglaçante',
    71: 'Neige faible', 73: 'Neige', 75: 'Neige forte', 77: 'Grains de neige',
    80: 'Averses', 81: 'Averses', 82: 'Averses fortes',
    85: 'Averses neige', 86: 'Averses neige',
    95: 'Orage', 96: 'Orage grêle', 99: 'Orage grêle fort',
  };
  return labels[wmoCode] || '';
}

// ─── Fetch Open-Meteo ────────────────────────────────────────────────────────
async function fetchWeather(lat, lng, dateStr) {
  if (lat == null || lng == null) return null;

  // Open-Meteo forecast : ~3 mois de historique, ~16 jours de prévision
  // Open-Meteo archive : données historiques depuis 1940
  // On utilise l'archive pour les dates passées, le forecast pour les dates futures
  const today = new Date();
  const targetDate = new Date(dateStr);
  const daysDiff = Math.round((targetDate - today) / 86400000);
  const useArchive = daysDiff < -14; // dates passées de plus de 14 jours

  const baseUrl = useArchive
    ? 'https://archive-api.open-meteo.com/v1/archive'
    : 'https://api.open-meteo.com/v1/forecast';

  const url = `${baseUrl}` +
    `?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum` +
    `&hourly=temperature_2m` +
    `&timezone=auto` +
    `&start_date=${dateStr}&end_date=${dateStr}`;

  try {
    const resp = await fetch(url, { timeout: 5000 });
    if (!resp.ok) return null;
    const data = await resp.json();

    if (!data.daily) return null;

    const idx = 0; // On demande un seul jour

    // Extraire températures matin (9h) et après-midi (15h) depuis hourly
    let morningTemp = null;
    let afternoonTemp = null;
    if (data.hourly?.time && data.hourly?.temperature_2m) {
      for (let i = 0; i < data.hourly.time.length; i++) {
        const h = parseInt(data.hourly.time[i].slice(11, 13), 10);
        if (h >= 8 && h <= 10 && morningTemp == null) morningTemp = data.hourly.temperature_2m[i];
        if (h >= 14 && h <= 16 && afternoonTemp == null) afternoonTemp = data.hourly.temperature_2m[i];
      }
    }

    return {
      tempMax: data.daily.temperature_2m_max?.[idx] ?? null,
      tempMin: data.daily.temperature_2m_min?.[idx] ?? null,
      tempMorning: morningTemp,
      tempAfternoon: afternoonTemp,
      weatherCode: data.daily.weathercode?.[idx] ?? null,
      precipitation: data.daily.precipitation_sum?.[idx] ?? null,
      icon: getWeatherIcon(data.daily.weathercode?.[idx]),
      label: getWeatherLabel(data.daily.weathercode?.[idx]),
    };
  } catch {
    return null;
  }
}

// ─── Route : GET /api/weather?lat=...&lng=...&date=... ──────────────────────

router.get('/', async (req, res) => {
  const { lat, lng, date } = req.query;
  if (!lat || !lng || !date) {
    return res.status(400).json({ error: 'lat, lng et date requis' });
  }

  const weather = await fetchWeather(parseFloat(lat), parseFloat(lng), date);
  if (!weather) return res.status(502).json({ error: 'Impossible de récupérer la météo' });

  res.json(weather);
});

// ─── Route : POST /api/weather/batch ─────────────────────────────────────────
// Corps : { steps: [{ lat, lng, date, id }] }
// Retour : { weather: { [stepId]: { tempMax, tempMin, weatherCode, icon, label } } }

router.post('/batch', async (req, res) => {
  const { steps } = req.body;
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'steps requis (tableau)' });
  }

  const results = {};
  const promises = steps.map(async (step) => {
    if (step.lat == null || step.lng == null || !step.date) return;
    const w = await fetchWeather(step.lat, step.lng, step.date);
    if (w) results[step.id] = w;
  });

  await Promise.all(promises);
  res.json({ weather: results });
});

module.exports = router;
