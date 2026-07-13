/**
 * camping.js — Agrégateur multi-API pour les campings
 * Kampaoh (Espagne/Portugal) + Webcamp.fr + Google Places
 */
const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,es;q=0.7',
};

// ── Kampaoh API ───────────────────────────────────────────────────────────────

/**
 * Récupère les disponibilités d'une propriété Kampaoh
 */
async function checkKampaoh(propertyId, checkin, checkout) {
  const url = `https://api.prod.kampaoh.com/api/v3/properties/${propertyId}/rooms/boards/plans`;
  try {
    const resp = await axios.get(url, {
      params: { checkin, checkout, currency: 'EUR' },
      headers: {
        ...HEADERS,
        'origin':  'https://kampaoh.com',
        'referer': 'https://kampaoh.com/',
        'x-api-key': 'pub_k_123',
      },
      timeout: 10000,
    });

    const data   = resp.data;
    const rooms  = data?.rooms || data?.data?.rooms || [];
    const plans  = rooms.flatMap(r =>
      (r.plans || []).map(p => ({
        roomName:  r.name || r.title,
        planName:  p.name,
        price:     p.total_price || p.price,
        currency:  'EUR',
        available: (p.availability || 0) > 0,
        minStay:   p.min_stay,
        maxStay:   p.max_stay,
      }))
    );

    return {
      provider:  'kampaoh',
      available: plans.some(p => p.available),
      plans,
      checkin,
      checkout,
    };
  } catch (e) {
    return { provider: 'kampaoh', available: null, error: e.message };
  }
}

/**
 * Recherche des propriétés Kampaoh autour d'une position
 */
async function searchKampaohNearby(lat, lng, radius = 50) {
  const url = 'https://api.prod.kampaoh.com/api/v3/properties';
  try {
    const resp = await axios.get(url, {
      params: {
        lat,
        lng,
        radius,
        limit: 20,
        currency: 'EUR',
      },
      headers: {
        ...HEADERS,
        'origin':  'https://kampaoh.com',
        'x-api-key': 'pub_k_123',
      },
      timeout: 10000,
    });

    const props = resp.data?.data || resp.data?.properties || [];
    return props.map(p => ({
      id:       p.id || p.slug,
      name:     p.name,
      lat:      p.latitude  || p.lat,
      lng:      p.longitude || p.lng,
      rating:   p.rating    || p.score,
      address:  p.address   || p.location,
      website:  `https://kampaoh.com/es/camping/${p.slug || p.id}`,
      provider: 'kampaoh',
      amenities: p.amenities || [],
      photo:    p.cover_image || p.image,
    }));
  } catch (_) {
    return [];
  }
}

// ── Webcamp.fr API ────────────────────────────────────────────────────────────

const WEBCAMP_DOMAINS = ['webcamp.fr', 'thelisresa.webcamp.fr'];

/**
 * Détecte l'ID webcamp.fr depuis le site d'un camping
 */
async function findWebcampId(websiteUrl) {
  if (!websiteUrl || websiteUrl === 'N/A') return null;

  const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
  if (!fetch) return null; // node-fetch non installé

  const parsed = new URL(websiteUrl);
  const base   = `${parsed.protocol}//${parsed.hostname}`;
  const urls   = [websiteUrl, `${base}/reservas`, `${base}/reservation`, `${base}/booking`];

  for (const url of urls.slice(0, 3)) {
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow', timeout: 8000 });
      if (!r.ok) continue;
      const text = await r.text();
      const m = text.match(/thelisresa\.webcamp\.fr[^"']*[?&]camping=([^&\s"']+)/);
      if (m) return m[1];
      const m2 = text.match(/webcamp\.fr[^"']*[?&]camping=([^&\s"']+)/);
      if (m2) return m2[1];
    } catch (_) {}
  }
  return null;
}

/**
 * Vérifie disponibilité via l'API thelisresa.webcamp.fr
 */
async function checkWebcamp(campingId, begin, end, nbPers = 2) {
  try {
    // 1. Obtenir session
    const sessUrl = `https://thelisresa.webcamp.fr/list.php?camping=${campingId}&lang=fr`;
    const sessResp = await axios.get(sessUrl, { headers: HEADERS, timeout: 12000 });
    const phpsessid = sessResp.headers['set-cookie']
      ?.find(c => c.includes('PHPSESSID'))
      ?.match(/PHPSESSID=([^;]+)/)?.[1] || 'anon';

    // 2. Requête disponibilité
    const beginDt   = new Date(begin);
    const endDt     = new Date(end);
    const duration  = Math.round((endDt - beginDt) / 86400000);

    const apiUrl = `https://thelisresa.webcamp.fr/2017/services/Search/search?camping=${campingId}&PHPSESSID=${phpsessid}`;
    const payload = {
      dates:    { begin, end, criteria: [] },
      type:     '1',
      nb_pers:  String(nbPers),
      duration,
      promoCode: '',
      global_criteria: { surface: null, nb_bedrooms: null, nb_bathrooms: null },
      chosenSite: null,
    };

    const resp = await axios.post(apiUrl, payload, {
      headers: {
        ...HEADERS,
        'accept':       'application/json',
        'content-type': 'application/json;charset=UTF-8',
        'origin':       'https://thelisresa.webcamp.fr',
      },
      timeout: 15000,
    });

    const results     = resp.data?.results?.[0]?.results || [];
    const allProducts = [];

    for (const group of results) {
      for (const prod of group.products || []) {
        const t = prod.product?.type?.type;
        if (t !== 'camping') continue;
        for (const stay of prod.stays || []) {
          allProducts.push({
            name:     prod.product?.name,
            begin:    stay.begin,
            end:      stay.end,
            duration: stay.duration,
            price:    stay.price,
            stock:    prod.stock,
          });
        }
      }
    }

    return {
      provider:  'webcamp',
      campingId,
      available: allProducts.length > 0,
      products:  allProducts.slice(0, 5),
      checkin:   begin,
      checkout:  end,
    };
  } catch (e) {
    return { provider: 'webcamp', available: null, error: e.message };
  }
}

// ── Agrégateur : vérifie toutes les sources ───────────────────────────────────

async function checkAvailability({ camping, checkin, checkout, groupSize = 2 }) {
  const results = [];

  // Kampaoh
  if (camping.kampaohId) {
    results.push(await checkKampaoh(camping.kampaohId, checkin, checkout));
  }

  // Webcamp
  if (camping.webcampId) {
    results.push(await checkWebcamp(camping.webcampId, checkin, checkout, groupSize));
  }

  // Si le camping a un site web mais pas d'ID webcamp encore, tenter la détection
  if (!camping.webcampId && camping.website && camping.website !== 'N/A') {
    const wid = await findWebcampId(camping.website);
    if (wid) {
      results.push(await checkWebcamp(wid, checkin, checkout, groupSize));
      camping.webcampId = wid; // cache
    }
  }

  const available = results.some(r => r.available === true);
  const unknown   = results.length === 0 || results.every(r => r.available === null);

  return {
    camping: {
      name:    camping.name,
      placeId: camping.placeId,
      website: camping.website,
    },
    checkin,
    checkout,
    groupSize,
    available: unknown ? null : available,
    results,
    bookingUrl: camping.website || null,
  };
}

module.exports = {
  checkKampaoh,
  searchKampaohNearby,
  findWebcampId,
  checkWebcamp,
  checkAvailability,
};
