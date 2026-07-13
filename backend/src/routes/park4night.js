/**
 * routes/park4night.js — Lieux via l'API Park4Night officielle (avec fallback Overpass)
 */
const express = require('express')
const axios   = require('axios')

const router = express.Router()

// ── Types P4N → couleur ────────────────────────────────────────────────────────
const TYPE_COLORS = {
  9:  '#f97316', // Camping
  8:  '#8b5cf6', // Aire CC
  7:  '#6366f1', // Parking
  10: '#22c55e', // Bivouac
  12: '#6366f1', // Parking journée
  14: '#3b82f6', // Services
  57: '#64748b', // Station service
}

function p4nPlaceToInternal(p) {
  const typeId    = p.type?.id ?? 7
  const typeLabel = p.type?.label ?? 'Lieu'
  const typeColor = TYPE_COLORS[typeId] ?? '#6366f1'
  const name = p.title_short || p.name || (p.title ? p.title.replace(/<[^>]+>/g, '').trim() : null) || `#${p.id}`
  return {
    id:          p.id,
    name,
    lat:         p.lat,
    lng:         p.lng,
    description: p.description ?? null,
    typeId,
    typeLabel,
    typeColor,
    rating:      p.rating ?? null,
    nbRatings:   p.review ?? 0,
    nbPhotos:    p.photo ?? 0,
    url:         `https://park4night.com${p.url}`,
    address:     p.address ?? null,
    services:    p.services ?? [],
    activities:  p.activities ?? [],
    image:       p.images?.[0]?.thumb ?? null,
    distance:    p.distance ?? null,
  }
}

// ── Fallback Overpass ──────────────────────────────────────────────────────────
const OSM_TYPE_MAP = {
  camp_site:    { label: 'Camping',  color: '#f97316', typeId: 9  },
  caravan_site: { label: 'Aire CC',  color: '#8b5cf6', typeId: 8  },
  picnic_site:  { label: 'Bivouac',  color: '#22c55e', typeId: 10 },
  camp_pitch:   { label: 'Bivouac',  color: '#22c55e', typeId: 10 },
}

function osmNodeToPlace(el) {
  const tags = el.tags ?? {}
  const lat  = el.lat ?? el.center?.lat
  const lng  = el.lon ?? el.center?.lon
  const key  = tags.tourism || 'camp_site'
  const typeInfo = OSM_TYPE_MAP[key] ?? { label: 'Lieu', color: '#6366f1', typeId: 7 }
  return {
    id:          el.id,
    name:        tags.name || tags['name:fr'] || `${typeInfo.label} #${el.id}`,
    lat:         parseFloat(lat),
    lng:         parseFloat(lng),
    description: tags.description ?? null,
    typeId:      typeInfo.typeId,
    typeLabel:   typeInfo.label,
    typeColor:   typeInfo.color,
    rating:      null,
    nbRatings:   0,
    nbPhotos:    0,
    url:         `https://park4night.com/en/map#16/${parseFloat(lat).toFixed(6)}/${parseFloat(lng).toFixed(6)}`,
    address:     null,
    services:    [],
    activities:  [],
    image:       null,
    distance:    null,
  }
}

async function fetchFromOverpass(lat, lng, radius) {
  const r = parseInt(radius)
  const query = `
[out:json][timeout:12];
(
  node[tourism=camp_site](around:${r},${lat},${lng});
  node[tourism=caravan_site](around:${r},${lat},${lng});
  node[tourism=picnic_site](around:${r},${lat},${lng});
  node[tourism=camp_pitch](around:${r},${lat},${lng});
  way[tourism=camp_site](around:${r},${lat},${lng});
  way[tourism=caravan_site](around:${r},${lat},${lng});
);
out center 80;
`.trim()

  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  for (const url of ENDPOINTS) {
    try {
      const resp = await axios.get(url, {
        params: { data: query },
        headers: { 'User-Agent': 'RoadTripPlanner/1.0' },
        timeout: 13000,
      })
      return (resp.data?.elements ?? [])
        .filter(el => (el.lat ?? el.center?.lat) != null)
        .map(osmNodeToPlace)
    } catch (e) {
      console.warn(`[park4night/overpass] ${url}: ${e.message}`)
    }
  }
  return []
}

// ── Route principale ───────────────────────────────────────────────────────────
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 25000, lang = 'fr' } = req.query
    if (!lat || !lng) return res.status(400).json({ error: 'lat/lng requis' })

    try {
      const p4nRes = await axios.get('https://park4night.com/api/places/around', {
        params: { lat, lng, radius: Math.min(Math.round(parseInt(radius) / 1000), 200), filter: '{}', lang },
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
          'Accept':          '*/*',
          'Accept-Language': 'fr,fr-FR;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type':    'application/json',
          'Referer':         `https://park4night.com/fr/search?lat=${lat}&lng=${lng}&z=13`,
        },
        timeout: 12000,
      })

      let raw = p4nRes.data
      if (typeof raw === 'string') {
        try {
          // P4N retourne du JSON encodé en base64 avec Content-Type: text/html
          const decoded = Buffer.from(raw, 'base64').toString('utf-8')
          raw = JSON.parse(decoded)
        } catch {
          try { raw = JSON.parse(raw) } catch { raw = [] }
        }
      }
      const items = Array.isArray(raw) ? raw : (raw?.places ?? raw?.results ?? [])
      if (items.length > 0) {
        const places = items.map(p4nPlaceToInternal)
        console.log(`[park4night] API officielle: ${places.length} lieux`)
        return res.json({ places, total: places.length, source: 'park4night' })
      }
    } catch (e) {
      console.warn(`[park4night] API officielle echouee: ${e.message}`)
    }

    res.json({ places: [], total: 0, source: 'park4night' })

  } catch (err) {
    console.error('[park4night] erreur:', err.message)
    res.json({ places: [], total: 0, error: err.message })
  }
})

// ── Détail d'un lieu ───────────────────────────────────────────────────────────
router.get('/place/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { lang = 'fr' } = req.query
    const p4nRes = await axios.get(`https://park4night.com/api/places/${encodeURIComponent(id)}`, {
      params: { lang },
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
        'Accept':          'application/json, */*',
        'AXIOS-AJAX':      'true',
        'Referer':         `https://park4night.com/fr/place/${id}`,
      },
      timeout: 10000,
    })
    let p = p4nRes.data
    if (typeof p === 'string') {
      try { p = JSON.parse(Buffer.from(p, 'base64').toString('utf-8')) } catch {
        try { p = JSON.parse(p) } catch { p = null }
      }
    }
    if (!p || !p.id) return res.status(404).json({ error: 'Lieu introuvable' })

    res.json({
      id:          p.id,
      name:        p.title_short || p.name || `#${p.id}`,
      lat:         p.lat,
      lng:         p.lng,
      description: p.description ?? null,
      typeId:      p.type?.id ?? null,
      typeLabel:   p.type?.label ?? null,
      url:         `https://park4night.com${p.url}`,
      address:     p.address ?? null,
      services:    p.services ?? [],
      activities:  p.activities ?? [],
      images:      (p.images ?? []).map(img => img.url ?? img.thumb),
      rating:      p.rating ?? null,
      nbRatings:   p.review ?? 0,
      isPro:       p.isPro ?? false,
      isTop:       p.isTop ?? false,
      createdAt:   p.created_at ?? null,
      onlineBooking: p.online_booking ?? false,
    })
  } catch (err) {
    console.error('[park4night/place] erreur:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
